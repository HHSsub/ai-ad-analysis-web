import limiter from "@/lib/limiter/bottleneck";
import { GoogleGenerativeAI, type Part } from "@google/generative-ai";

type RetriableError = {
  status?: number;
  message?: string;
  response?: {
    status?: number;
    headers?: any;
  };
};

// ✅ 강제로 2.5 이상 모델만 사용 - 1.5, 2.0 절대 금지
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "gemini-2.5-pro,gemini-2.5-flash-8b")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter(model => {
    // 1.5나 2.0 모델 완전 차단
    if (model.includes('1.5') || model.includes('2.0')) {
      console.warn(`⚠️ 구식 모델 차단됨: ${model}`);
      return false;
    }
    return true;
  });

// 최소 재시도(빈 응답/일시 오류만)
const MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || "2", 10);
const BASE_MS = parseInt(process.env.GEMINI_BACKOFF_BASE_MS || "800", 10);
const CAP_MS = parseInt(process.env.GEMINI_BACKOFF_CAP_MS || "8000", 10);

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function isRetriable(err: RetriableError) {
  const status = err?.response?.status ?? err?.status;
  if (!status) return true;
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function backoffMs(attempt: number) {
  const exp = Math.min(CAP_MS, BASE_MS * Math.pow(2, attempt));
  const jitter = Math.random() * 0.2 * exp;
  return Math.min(CAP_MS, Math.floor(exp * 0.9 + jitter));
}

export type GenerateOptions = {
  parts: Part[];
  model?: string;
  systemInstruction?: string;
  generationConfig?: Record<string, any>;
  safetySettings?: Record<string, any>;
  maxRetries?: number;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    status?: number;
    model: string;
    error: unknown;
  }) => void;
};

export async function generateContentWithRetry(opts: GenerateOptions) {
  const {
    parts,
    model = DEFAULT_MODEL,
    systemInstruction,
    generationConfig,
    safetySettings,
    maxRetries = MAX_RETRIES,
    onRetry,
  } = opts;

  // ✅ 구식 모델 완전 차단
  let requestedModel = model;
  if (requestedModel.includes('1.5') || requestedModel.includes('2.0')) {
    console.warn(`⚠️ 구식 모델 ${requestedModel} 차단, gemini-2.5-flash로 강제 변경`);
    requestedModel = 'gemini-2.5-flash';
  }

  // ✅ 폴백 모델들도 검증
  const validModels = [requestedModel, ...FALLBACK_MODELS].filter(m => 
    !m.includes('1.5') && !m.includes('2.0')
  );

  if (validModels.length === 0) {
    validModels.push('gemini-2.5-flash'); // 최종 안전장치
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  let lastError: unknown;

  for (let mIndex = 0; mIndex < validModels.length; mIndex++) {
    const currentModel = validModels[mIndex];
    console.log(`🤖 Gemini 모델 사용: ${currentModel}`);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const modelClient = genAI.getGenerativeModel({
          model: currentModel,
          systemInstruction,
        });

        const result = await limiter.schedule(() =>
          modelClient.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8000,
              ...generationConfig,
            },
            safetySettings,
          } as any)
        );

        const rawResp = result?.response;
        const text = rawResp?.text?.() ?? "";
        const candidates = (rawResp as any)?.candidates ?? [];

        // 빈 응답/후보 없음만 재시도
        if (!text || !text.trim() || candidates.length === 0) {
          const err = new Error("Empty response from Gemini");
          (err as any).response = { status: 503 };
          throw err;
        }

        console.log(`✅ Gemini 응답 성공: ${currentModel} (길이: ${text.length})`);
        return { text, response: rawResp, model: currentModel };
      } catch (error: any) {
        lastError = error;
        console.log(`⚠️ Gemini 오류 [${currentModel}] 시도${attempt+1}: ${error.message}`);
        
        if (!isRetriable(error) || attempt === maxRetries) break;
        const delay = backoffMs(attempt);
        onRetry?.({
          attempt: attempt + 1,
          delayMs: delay,
          status: error?.response?.status ?? error?.status,
          model: currentModel,
          error,
        });
        await sleep(delay);
      }
    }
    // 다음 모델로 폴백
  }

  const status = (lastError as any)?.response?.status ?? (lastError as any)?.status;
  const message = (lastError as any)?.message || "Gemini generateContent failed.";
  const err = new Error(`[Gemini] ${status || ""} ${message}`.trim());
  (err as any).cause = lastError;
  throw err;
}
