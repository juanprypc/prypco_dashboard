type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const MAX_REQUESTS = Math.max(1, Number(process.env.AIRTABLE_RATE_LIMIT || 5));

class AirtableRateLimiter {
  private queue: Job[] = [];
  private tokens: number;
  private readonly maxTokens: number;
  private readonly timer: NodeJS.Timeout;

  constructor(maxTokens: number) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.timer = setInterval(() => {
      this.tokens = this.maxTokens;
      this.drain();
    }, 1000);
    // Allow the process to exit naturally in serverless environments
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        run: () => fn(),
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.drain();
    });
  }

  private drain() {
    while (this.tokens > 0 && this.queue.length) {
      const job = this.queue.shift()!;
      this.tokens -= 1;
      job
        .run()
        .then((value) => job.resolve(value))
        .catch((err) => job.reject(err))
        .finally(() => {
          // If tokens were replenished while this job was running, continue draining
          if (this.tokens > 0 && this.queue.length) {
            this.drain();
          }
        });
    }
  }
}

const limiter = new AirtableRateLimiter(MAX_REQUESTS);

export function scheduleAirtableRequest<T>(fn: () => Promise<T>): Promise<T> {
  return limiter.schedule(fn);
}
