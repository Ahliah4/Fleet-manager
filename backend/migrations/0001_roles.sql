-- Phase 1 database roles.
--
-- app_rw is intentionally created without LOGIN. An operator must grant LOGIN and
-- set a password (or use the platform's IAM authentication) for the API. The
-- migration owner continues to run migrations and provisioning.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOINHERIT;
  END IF;
END
$$;

COMMENT ON ROLE app_rw IS
  'Least-privilege Fleet Manager API role. RLS is forced; no DDL or DELETE grants.';
