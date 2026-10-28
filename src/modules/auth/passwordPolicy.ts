import { ValidationError } from "@/lib/errors";

/**
 * Password rules for every password a person chooses (ADR-028). With no
 * second factor, the password must not be guessable:
 *  - at least 10 characters (up to 128)
 *  - letters and numbers
 *  - not the person's email name or ID
 *  - not a well-known password
 * Messages are fixed, translatable strings.
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const PW_TOO_SHORT = "Password must be at least 10 characters";
export const PW_TOO_LONG = "Password is too long";
export const PW_NEEDS_MIX = "Password must contain letters and numbers";
export const PW_PERSONAL = "Password must not contain your email or ID";
export const PW_COMMON = "This password is too common. Choose another one";
export const PW_MISMATCH = "Passwords do not match";

// Most-used passwords and obvious local choices (compared without case, digits stripped too).
const COMMON = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "asdfghjkl", "abcdef", "abcdefgh", "iloveyou", "welcome",
  "letmein", "admin", "administrator", "monkey", "dragon", "football", "baseball", "sunshine", "princess",
  "master", "shadow", "superman", "trustno", "starwars", "orbit", "orbitcargo", "cargo", "logistics",
  "somalia", "mogadishu", "muqdisho", "hargeisa", "xamar", "soomaali", "somali", "allah", "bismillah",
  "changeme", "secret", "test", "testing", "demo", "default", "user", "login", "access",
]);

function isCommon(pw: string): boolean {
  const lower = pw.toLowerCase();
  const letters = lower.replace(/[^a-z]/g, "");
  if (COMMON.has(lower) || COMMON.has(letters)) return true;
  if (/^(\d)\1+$/.test(pw) || /^(?:0123456789|1234567890|9876543210)/.test(pw)) return true;
  // Sequences like 123456789a / abc12345678
  return /^(?:123456789|12345678|abc12345|qwerty12)/i.test(pw);
}

/** Throws a ValidationError when the new password breaks a rule. */
export function assertStrongPassword(
  password: string,
  confirm: string | undefined,
  context: { email?: string | null; id?: string | null } = {},
): void {
  if (password.length < PASSWORD_MIN) throw new ValidationError(PW_TOO_SHORT);
  if (password.length > PASSWORD_MAX) throw new ValidationError(PW_TOO_LONG);
  if (confirm !== undefined && password !== confirm) throw new ValidationError(PW_MISMATCH);
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw new ValidationError(PW_NEEDS_MIX);
  const lower = password.toLowerCase();
  const emailName = context.email?.split("@")[0]?.toLowerCase();
  const id = context.id?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if ((emailName && emailName.length >= 3 && lower.includes(emailName)) || (id && id.length >= 3 && lower.replace(/[^a-z0-9]/g, "").includes(id))) {
    throw new ValidationError(PW_PERSONAL);
  }
  if (isCommon(password)) throw new ValidationError(PW_COMMON);
}
