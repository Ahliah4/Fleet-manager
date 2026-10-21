-- ============================================================================
-- Fleet Manager — enable the daily expiry/service alert job
-- ----------------------------------------------------------------------------
-- Run supabase/schema.sql first; it defines
-- public.generate_expiry_notifications().
--
-- This script only schedules that function with pg_cron. On Supabase, enable
-- the extension under Database → Extensions → pg_cron if the statement below
-- reports that it is unavailable.
--
-- The job runs at 06:00 UTC. It uses each vehicle creator's notification
-- preferences and de-duplicates alerts by (fleet_id, dedupe_key), so it is safe
-- to run repeatedly. Times are UTC; client-side checks use the user's local
-- timezone.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise exception 'pg_cron is not available. Enable it in Database → Extensions, then rerun this script.';
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fleet-expiry-alerts') then
    perform cron.unschedule('fleet-expiry-alerts');
  end if;

  perform cron.schedule(
    'fleet-expiry-alerts',
    '0 6 * * *',
    'select public.generate_expiry_notifications()'
  );
end $$;

-- Verify:
--   select jobid, jobname, schedule, active from cron.job;
--   select public.generate_expiry_notifications();
