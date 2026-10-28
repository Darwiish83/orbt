-- Fingerprint of an OrbitCargo database (ADR-030). Run it on the old and the
-- new server after a move/restore; every line must be identical.
--   psql "<admin or owner URL without ?schema=public>" -qAt -f scripts/db-fingerprint.sql
-- Prints counts and hashes only — never any data.
CREATE TEMP TABLE c(t text, n bigint);
DO $$ DECLARE r record; n bigint; BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.tablename) INTO n; INSERT INTO c VALUES (r.tablename, n);
  END LOOP; END $$;
SELECT 'rows', md5(string_agg(t||':'||n, ',' ORDER BY t)), sum(n) FROM c;
SELECT 'files', count(*), md5(string_agg(sha256, ',' ORDER BY key)), bool_and(sha256 = encode(sha256(data),'hex')) FROM "StoredFile";
SELECT 'triggers', count(*) FROM pg_trigger WHERE NOT tgisinternal;
SELECT 'policies', count(*) FROM pg_policies WHERE schemaname='public';
SELECT 'rls_tables', count(*) FROM pg_class WHERE relrowsecurity AND relnamespace='public'::regnamespace;
SELECT 'grants', md5(string_agg(grantee||table_name||privilege_type, ',' ORDER BY grantee, table_name, privilege_type)) FROM information_schema.role_table_grants WHERE grantee IN ('orbit_runtime','orbit_portal');
SELECT 'not_owner_owned', count(*) FROM pg_tables WHERE schemaname='public' AND tableowner <> 'orbit_owner';
