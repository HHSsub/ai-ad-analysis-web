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

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || "6", 10);
const BASE_MS = parseInt(process.env.GEMINI_BACKOFF_BASE_MS || "1000", 10); // 1s
const CAP_MS = parseInt(process.env.GEMINI_BACKOFF_CAP_MS || "30000", 10);  // 30s

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function isRetriable(err: RetriableError) {
  const status = err?.response?.status ?? err?.status;
  if (!status) return true; // 네트워크/알 수 없는 오류는 재시도
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

function getRetryAfterMs(err: RetriableError): number | null {
  const headers = err?.response?.headers;
  if (!headers) return null;

  // 다양한 클라이언트 형태 대응
  const headerVal =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers.get?.("retry-after") ??
    headers.get?.("Retry-After");

  if (!headerVal) return null;

  // Retry-After: seconds | HTTP-date
  const asNumber = Number(headerVal);
  if (!Number.isNaN(asNumber)) {
    return asNumber * 1000;
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

function backoffMs(attempt: number) {
  // Truncated exponential backoff + jitter
  const exp = Math.min(CAP_MS, BASE_MS * Math.pow(2, attempt));
  const jitter = Math.random() * 0.2 * exp; // +-20% 지터
  return Math.min(CAP_MS, Math.floor(exp * 0.9 + jitter));
}

export type GenerateOptions = {
  parts: Part[]; // [{text: "..."}] 등
  model?: string;
  systemInstruction?: string;
  generationConfig?: Record<string, any>;
  safetySettings?: Record<string, any>;
  // 특정 호출에서 재시도/백오프 오버라이드
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

  const models = [model, ...FALLBACK_MODELS];

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

  let lastError: unknown;

  for (let mIndex = 0; mIndex < models.length; mIndex++) {
    const currentModel = models[mIndex];

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const modelClient = genAI.getGenerativeModel({
          model: currentModel,
          systemInstruction,
          // generationConfig/safetySettings는 여기서 기본값 포함 가능
        });

        // 전역 동시성/RPS 제한 하에 실행
        const result = await limiter.schedule(() =>
          modelClient.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
          } as any)
        );

        const text = result?.response?.text?.() ?? "";
        return { text, response: result?.response, model: currentModel };
      } catch (error: any) {
        lastError = error;

        if (!isRetriable(error) || attempt === maxRetries) {
          // 재시도 불가 또는 재시도 초과 => 다음 모델로 폴백 시도, 마지막 모델이면 throw
          break;
        }

        // Retry-After 우선 적용
        const retryAfter = getRetryAfterMs(error);
        const delay = retryAfter ?? backoffMs(attempt);

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

    // 다음 모델로 폴백 진행 (현재 모델에서 성공 못함)
  }

  // 모든 모델/재시도 실패
  const status = (lastError as any)?.response?.status ?? (lastError as any)?.status;
  const message =
    (lastError as any)?.message ||
    "Gemini generateContent failed after retries and model fallbacks.";
  const err = new Error(`[Gemini] ${status || ""} ${message}`.trim());
  (err as any).cause = lastError;
  throw err;
}
