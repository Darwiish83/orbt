/**
 * Runs once at server startup (Next.js instrumentation). Validates the
 * environment so the process fails fast on misconfiguration rather than at the
 * first request. Only runs in the Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}
