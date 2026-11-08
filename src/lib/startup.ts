import { isConfigError } from "./configError";

/**
 * The mandatory startup checks (called from src/instrumentation.ts).
 *
 * Production: the environment rules and the database-role check must pass, or
 * the process logs one sanitized line and exits with code 1. Next.js would
 * otherwise keep the process running and answer every request with 500, which
 * a process supervisor (systemd) cannot see as a failure.
 *
 * Development and tests: only the environment rules run, and a failure is
 * thrown to Next.js as before (shown in the dev overlay); nothing exits.
 */
export interface StartupChecks {
  /** Validates the environment (throws ConfigError). */
  validateEnv: () => unknown;
  /** Refuses an over-privileged database role (throws ConfigError); production only. */
  checkDatabaseRoles: () => Promise<void>;
}

export async function runStartupChecks(
  nodeEnv: string | undefined,
  checks: StartupChecks,
  exit: (code: number) => never = (code) => process.exit(code),
  log: (line: string) => void = (line) => console.error(line),
): Promise<void> {
  if (nodeEnv !== "production") {
    await checks.validateEnv();
    return;
  }
  try {
    await checks.validateEnv();
    await checks.checkDatabaseRoles();
  } catch (err) {
    log(startupFailureMessage(err));
    exit(1);
  }
}

/**
 * One log line for a failed production start. A ConfigError's message is
 * written to be safe; any other error (e.g. the database is unreachable) may
 * carry connection details in its message, so only its kind and code are shown.
 */
export function startupFailureMessage(err: unknown): string {
  if (isConfigError(err)) return `[startup] OrbitCargo refused to start: ${err.message}`;
  const e = err as { name?: unknown; code?: unknown; errorCode?: unknown } | null;
  const name = typeof e?.name === "string" ? e.name : "Error";
  const rawCode = e?.errorCode ?? e?.code;
  const code = typeof rawCode === "string" && /^[A-Za-z0-9_]{1,32}$/.test(rawCode) ? ` ${rawCode}` : "";
  return `[startup] OrbitCargo refused to start: the startup checks could not complete (${name}${code}); details are withheld because they may contain connection settings.`;
}
