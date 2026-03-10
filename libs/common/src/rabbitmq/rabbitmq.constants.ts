// ── Exchange ──
export const RMQ_EXCHANGE = {
  NAME: 'app_exchange',
  TYPE: 'topic',
} as const;

// ── Queue Names ──
export const QUEUE_NAMES = {
  EMAIL: 'email_queue',
  EMAIL_DLQ: 'email_queue_dlq',
  // JOB: 'job_queue',  → ileride eklenecek
} as const;

// ── Routing Keys ──
// Publisher'lar bu key'leri kullanarak mesaj gönderir.
// Exchange, key pattern'ine göre doğru queue'ya yönlendirir.
export const ROUTING_KEYS = {
  // Email routing keys
  EMAIL_LOCK: 'email.lock',
  EMAIL_WELCOME: 'email.welcome', // ileride
  EMAIL_VERIFY: 'email.verify', // ileride
  EMAIL_RESET: 'email.reset', // ileride

  // Binding patterns (consumer tarafında kullanılır)
  EMAIL_ALL: 'email.#', // tüm email.* mesajlarını yakalar
  // JOB_ALL: 'job.#',                      // ileride
} as const;

// ── Injection Tokens ──
export const RMQ_TOKENS = {
  EMAIL: 'RMQ_EMAIL_CLIENT',
} as const;

// ── Retry Config ──
export const RMQ_MAX_RETRIES = 3;
export const RMQ_RETRY_DELAYS = [2000, 5000, 15000]; // ms — artan bekleme
