import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id password hashing. Argon2id is @node-rs/argon2's default algorithm.
 * Parameters follow OWASP guidance (memory 19 MiB, 2 iterations, parallelism 1).
 * Argon2 embeds the salt and parameters in the encoded hash string, so no
 * separate salt column is needed.
 */
const OPTIONS = {
  memoryCost: 19456, // KiB (~19 MiB)
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return hash(plain, OPTIONS);
}

export async function verifyPassword(encodedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(encodedHash, plain);
  } catch {
    return false;
  }
}
