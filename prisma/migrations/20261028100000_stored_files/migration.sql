-- ADR-030: file bytes (documents, announcement images) live in PostgreSQL, so
-- every database backup and every server move carries them.

-- CreateTable
CREATE TABLE "StoredFile" (
    "key" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("key")
);

-- The database checks every file itself: a random server-made key (never a
-- user filename), the real size, at most 10 MB, and a SHA-256 that matches
-- the bytes (a wrong or forged hash is refused).
ALTER TABLE "StoredFile"
  ADD CONSTRAINT "StoredFile_key_format" CHECK ("key" ~ '^[0-9a-f]{2}/[0-9a-f]{2}/[0-9a-f]{32}$'),
  ADD CONSTRAINT "StoredFile_size_matches" CHECK ("size" = octet_length("data")),
  ADD CONSTRAINT "StoredFile_size_limit" CHECK ("size" > 0 AND "size" <= 10485760),
  ADD CONSTRAINT "StoredFile_sha256_matches" CHECK ("sha256" = encode(sha256("data"), 'hex'));

-- Append-only: a stored file is never changed or deleted (documents are only
-- soft-deleted). Same guard as the audit log (ADR-029).
CREATE TRIGGER stored_file_append_only BEFORE UPDATE OR DELETE ON "StoredFile"
  FOR EACH ROW EXECUTE FUNCTION orbit_forbid('stored files are append-only');

-- Privileges: the app and the customer connection may add and read files;
-- nobody but the owner may change or remove them.
REVOKE ALL ON "StoredFile" FROM PUBLIC;
GRANT SELECT, INSERT ON "StoredFile" TO orbit_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON "StoredFile" FROM orbit_runtime;
GRANT SELECT, INSERT ON "StoredFile" TO orbit_portal;

-- Row-Level Security: a customer reads only the files of their own live
-- documents and of notifications meant for them; with no customer set,
-- nothing. A customer may add a file only while signed in (the Document row
-- that points at it is checked by Document's own policy).
ALTER TABLE "StoredFile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY runtime_all ON "StoredFile" FOR ALL TO orbit_runtime USING (true) WITH CHECK (true);
CREATE POLICY portal_own ON "StoredFile" FOR SELECT TO orbit_portal USING (
  EXISTS (SELECT 1 FROM "Document" d
          WHERE d."storageKey" = "StoredFile"."key" AND d."deletedAt" IS NULL AND d."customerId" = orbit_customer())
  OR EXISTS (SELECT 1 FROM "Notification" n
             WHERE n."imageKey" = "StoredFile"."key"
               AND (n."customerId" = orbit_customer() OR (n."audience" = 'ALL' AND orbit_customer() IS NOT NULL)))
);
CREATE POLICY portal_upload ON "StoredFile" FOR INSERT TO orbit_portal WITH CHECK (orbit_customer() IS NOT NULL);
