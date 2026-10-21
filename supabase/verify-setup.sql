-- Run in the Supabase SQL Editor after schema.sql, in the same project the app
-- uses. All four table names should be non-NULL. If profiles_table is NULL, the
-- migration was not applied to this project (or it failed before completing).

-- 1. Tables
select
  to_regclass('public.fleets') as fleets_table,
  to_regclass('public.profiles') as profiles_table,
  to_regclass('public.vehicles') as vehicles_table,
  to_regclass('public.notifications') as notifications_table;

-- 2. Columns used by the app. Expected: 11 rows (4 profile, 3 vehicle,
--    4 notification).
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'profiles'
      and column_name in ('id', 'role', 'fleet_id', 'notification_prefs'))
    or (table_name = 'vehicles'
      and column_name in ('user_id', 'fleet_id', 'next_service_date'))
    or (table_name = 'notifications'
      and column_name in ('user_id', 'fleet_id', 'dedupe_key', 'is_read'))
  )
order by table_name, column_name;

-- 3. Ownership/backfill. Expected: auth_users equals profiles, admins is at
--    least 1, and both "without_fleet" counts are 0 after a legacy upgrade.
select
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.profiles where role = 'admin') as admins,
  (select count(*) from public.vehicles where fleet_id is null) as vehicles_without_fleet,
  (select count(*) from public.notifications where fleet_id is null) as notifications_without_fleet;

-- 4. Duplicate registrations that prevented the unique index. Expected: no
--    rows. If rows appear, delete/merge the copies and rerun schema.sql.
select fleet_id, lower(trim(registration_number)) as registration_number, count(*) as copies
from public.vehicles
where fleet_id is not null
group by fleet_id, lower(trim(registration_number))
having count(*) > 1;

-- 5. Expected: vehicles_fleet_registration_unique. If this is empty, clean up
--    the duplicates above and rerun schema.sql.
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'vehicles'
  and indexname = 'vehicles_fleet_registration_unique';

-- 6. Row-level security. Expected: all four rows true.
select c.relname, c.relrowsecurity
from pg_class c
where c.oid in (
  to_regclass('public.profiles'),
  to_regclass('public.fleets'),
  to_regclass('public.vehicles'),
  to_regclass('public.notifications')
)
order by c.relname;

-- 7. A PostgREST schema refresh can be requested manually if the tables exist
--    but the REST API still reports "not found in the schema cache".
notify pgrst, 'reload schema';
