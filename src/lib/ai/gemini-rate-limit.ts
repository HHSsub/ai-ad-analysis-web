class SimpleRpsLimiter {
  private rps: number;
  private tokens: number;
  private queue: Array<() => void> = [];
  private timer?: NodeJS.Timeout;

  constructor(rps: number) {
    this.rps = Math.max(0, rps);
    this.tokens = this.rps;
    if (this.rps > 0) {
      this.timer = setInterval(() => {
        this.tokens = this.rps;
        this.drain();
      }, 1000);
      // @ts-ignore
      this.timer?.unref?.();
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    if (this.rps === 0) return fn();
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        if (this.tokens > 0) {
          this.tokens -= 1;
          fn().then(resolve).catch(reject);
        } else {
          this.queue.push(run);
        }
      };
      run();
    });
  }

  private drain() {
    while (this.tokens > 0 && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.tokens -= 1;
      next();
    }
  }
}

const GEMINI_RPS = parseInt(process.env.GEMINI_RPS || "0", 10);
const limiter = new SimpleRpsLimiter(GEMINI_RPS);

function isTransient(err: any) {
  const status = err?.response?.status ?? err?.status;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 429 ||
    (status >= 500 && status <= 599) ||
    msg.includes("overloaded") ||
    msg.includes("unavailable")
  );
}

function parseRetryAfterMs(err: any) {
  const h = err?.response?.headers;
  const ra =
    h?.get?.("retry-after") ??
    h?.["retry-after"] ??
    h?.get?.("Retry-After") ??
    h?.["Retry-After"];
  if (!ra) return 0;
  const s = Number(ra);
  if (!Number.isNaN(s)) return s * 1000;
  const t = Date.parse(ra);
  if (!Number.isNaN(t)) return Math.max(0, t - Date.now());
  return 0;
}

function backoffMs(attempt: number, base = 1200, cap = 15000) {
  const exp = Math.min(cap, base * Math.pow(2, attempt - 1));
  const jitter = Math.random() * 0.2 * exp;
  return Math.min(cap, Math.floor(exp * 0.9 + jitter));
}

export async function callGeminiWithTransientRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = parseInt(process.env.GEMINI_TRANSIENT_RETRIES || "5", 10),
): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await limiter.schedule(fn);
    } catch (e: any) {
      lastErr = e;
      const transient = isTransient(e);
      if (i === maxAttempts || !transient) break;
      const ra = parseRetryAfterMs(e);
      const delay = ra > 0 ? ra : backoffMs(i);
      console.warn(`[Gemini] transient error (attempt ${i}/${maxAttempts}), wait ${delay}ms:`, e?.message || e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}