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
const BASE_MS = parseInt(process.env.GEMINI_BACKOFF_BASE_MS || "1000", 10);
const CAP_MS = parseInt(process.env.GEMINI_BACKOFF_CAP_MS || "30000", 10);

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
  const headerVal =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    headers.get?.("retry-after") ??
    headers.get?.("Retry-After");
  if (!headerVal) return null;

  const asNumber = Number(headerVal);
  if (!Number.isNaN(asNumber)) return asNumber * 1000;
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
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
        });

        const result = await limiter.schedule(() =>
          modelClient.generateContent({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
          } as any)
        );

        const rawResp = result?.response;
        const text = rawResp?.text?.() ?? "";

        // 빈 응답/후보 없음은 재시도 유도
        const candidates = (rawResp as any)?.candidates ?? [];
        if (!text || !text.trim() || candidates.length === 0) {
          const err = new Error("Empty response from Gemini");
          (err as any).response = { status: 503 }; // 재시도 대상
          throw err;
        }

        return { text, response: rawResp, model: currentModel };
      } catch (error: any) {
        lastError = error;

        if (!isRetriable(error) || attempt === maxRetries) {
          break; // 다음 모델로 폴백
        }

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
    // 다음 모델로 폴백
  }

  const status = (lastError as any)?.response?.status ?? (lastError as any)?.status;
  const message =
    (lastError as any)?.message || "Gemini generateContent failed after retries and model fallbacks.";
  const err = new Error(`[Gemini] ${status || ""} ${message}`.trim());
  (err as any).cause = lastError;
  throw err;
}
