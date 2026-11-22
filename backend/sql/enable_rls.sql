-- =====================================================================
-- Enable Row Level Security on every table in the `public` schema.
--
-- WHY: Supabase exposes the `public` schema over its REST API
-- (PostgREST). The anon key ships in the frontend bundle, so without RLS
-- anyone holding it can read/write every table directly, bypassing the
-- FastAPI backend and its tenant checks.
--
-- WHAT THIS DOES: turns RLS ON with NO policies = deny-all for the
-- `anon` and `authenticated` roles used by the REST API. The app never
-- talks to these tables through Supabase REST, only through the
-- backend, so nothing in the app should need a policy.
--
-- BEFORE RUNNING - check which role the backend connects as
-- (the user in DATABASE_URL on Render):
--   * `postgres` (default Supabase connection string) -> table owner and
--     BYPASSRLS, the backend keeps working unchanged.
--   * any other role -> it must own the tables or have BYPASSRLS,
--     otherwise the backend will suddenly see zero rows.
-- Deliberately NOT using FORCE ROW LEVEL SECURITY, because that would
-- apply RLS to the table owner (the backend) too.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor, or
--   psql "$DATABASE_URL" -f backend/sql/enable_rls.sql
-- Idempotent - safe to run again. Re-run after any deploy that creates
-- new tables (SQLAlchemy create_all() does not enable RLS).
-- =====================================================================

BEGIN;

DO $$
DECLARE
    t record;
BEGIN
    FOR t IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
        RAISE NOTICE 'RLS enabled on public.%', t.tablename;
    END LOOP;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------
-- Verification: every row should show rls_enabled = true and
-- policy_count = 0.
-- ---------------------------------------------------------------------
SELECT
    c.relname                                   AS table_name,
    c.relrowsecurity                            AS rls_enabled,
    (SELECT count(*) FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- Quick external check (should return [] or a permission error, NOT data):
--   curl "$SUPABASE_URL/rest/v1/klijent?select=*" \
--        -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
