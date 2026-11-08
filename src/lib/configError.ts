/**
 * A server configuration problem found at startup (environment rules, database
 * role). Its message names keys and rules only, never a value, so it is safe to
 * log as is.
 */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/** True for a ConfigError, also across separately bundled copies of this module. */
export function isConfigError(err: unknown): err is ConfigError {
  return err instanceof ConfigError || (err instanceof Error && err.name === "ConfigError");
}
