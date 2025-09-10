type Job<T> = { fn: () => Promise<T>; resolve: (v: T) => void; reject: (e: any) => void };

class SimpleLimiter {
  private maxConcurrent: number;
  private rps: number;
  private running = 0;
  private queue: Job<any>[] = [];
  private tokens: number;
  private refillTimer?: NodeJS.Timeout;

  constructor({ maxConcurrent = 2, rps = 0 }: { maxConcurrent?: number; rps?: number } = {}) {
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.rps = Math.max(0, rps);
    this.tokens = this.rps;
    if (this.rps > 0) {
      this.refillTimer = setInterval(() => {
        this.tokens = this.rps;
        this.drain();
      }, 1000);
      // @ts-ignore
      this.refillTimer.unref?.();
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.drain();
    });
  }

  private drain() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      if (this.rps > 0) {
        if (this.tokens <= 0) return;
        this.tokens -= 1;
      }
      const job = this.queue.shift()!;
      this.running++;
      job.fn()
        .then((res) => job.resolve(res))
        .catch((err) => job.reject(err))
        .finally(() => {
          this.running--;
          Promise.resolve().then(() => this.drain());
        });
    }
  }
}

const maxConcurrent = parseInt(process.env.GEMINI_MAX_CONCURRENCY || "2", 10);
const rps = parseInt(process.env.GEMINI_RPS || "0", 10);

const limiter = new SimpleLimiter({ maxConcurrent, rps });

export default limiter;
