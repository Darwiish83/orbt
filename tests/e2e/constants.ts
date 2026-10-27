import { e2eEnv } from "./env";

/**
 * E2E accounts. Identifiers are not secret and live here; passwords and the
 * MFA seed come from the environment (.env.test locally, random per CI run),
 * never from the code. These accounts exist only in the separate E2E database.
 */
export const E2E_EMAIL = "e2e-admin@orbit.so";
export const E2E_PASSWORD = e2eEnv("E2E_PASSWORD");

export const E2E_EMPLOYEE_ID = "EMP-E2E";
export const E2E_CUSTOMER_REF = "OR-E2E";

export const E2E_CUSTOMER_EMAIL = "e2e-customer@orbit.so";
export const E2E_CUSTOMER_PASSWORD = e2eEnv("E2E_CUSTOMER_PASSWORD");

/** TOTP seed (base32) for the privileged E2E admin, so the suite can pass the MFA gate. */
export const E2E_MFA_SECRET = e2eEnv("E2E_MFA_SECRET");
