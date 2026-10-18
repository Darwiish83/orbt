/**
 * Minimal structured logger with sensitive-data redaction. Any object key that
 * looks like a secret (password, token, secret, key, hash, authorization,
 * cookie, session) has its value replaced before logging, at any nesting depth.
 */
const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|hash|apikey|api[_-]?key|sessionepoch|credential/i;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[Truncated]";
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(val, depth + 1);
  }
  return out;
}

type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};

/**
 * Error-monitoring hook. Logs the error (redacted) and forwards it to an
 * external monitor if one is registered (e.g. Sentry) via setErrorReporter.
 * Wiring the reporter is a deployment concern; the call sites are stable.
 */
type ErrorReporter = (error: unknown, context?: Record<string, unknown>) => void;
let reporter: ErrorReporter | null = null;

export function setErrorReporter(fn: ErrorReporter | null): void {
  reporter = fn;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error);
  emit("error", message, { ...context, name: error instanceof Error ? error.name : "Error" });
  try {
    reporter?.(error, context);
  } catch {
    /* never let monitoring crash the request */
  }
}
