-- ADR-028 (owner decision 2026-10-27): sign-in is Employee ID / Customer
-- Reference + email + password; the authenticator (TOTP) second factor is
-- removed. Clear every stored TOTP seed, replay marker and recovery code so no
-- account is left half-enrolled. Columns are kept (empty) so the feature could
-- be restored by a later migration without a destructive schema change.
UPDATE "User" SET "mfaEnabled" = false, "mfaSecret" = NULL, "mfaLastStep" = NULL
WHERE "mfaEnabled" OR "mfaSecret" IS NOT NULL OR "mfaLastStep" IS NOT NULL;
DELETE FROM "MfaRecoveryCode";
