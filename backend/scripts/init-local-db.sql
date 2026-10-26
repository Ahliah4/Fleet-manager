-- Local development only. These credentials are intentionally non-production.
-- The compose stack initializes this role before migrations run so the API can
-- connect as the least-privilege app_rw role. Real environments must set a
-- secret password outside the repository.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw LOGIN NOINHERIT PASSWORD 'fleet_local_only';
  END IF;
END
$$;

ALTER ROLE app_rw WITH LOGIN NOINHERIT PASSWORD 'fleet_local_only';
GRANT CONNECT ON DATABASE fleet TO app_rw;
