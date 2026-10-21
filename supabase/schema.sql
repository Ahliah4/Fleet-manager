-- ============================================================================
-- Fleet Manager — Supabase setup / upgrade script
-- ----------------------------------------------------------------------------
-- Run this once in Supabase → SQL Editor → New query. It is safe to run again.
--
-- What it sets up:
--   1. Fleets and profiles. Every account belongs to a fleet; members of the
--      same fleet share vehicles, notifications, and reports.
--   2. Owner columns, document/service dates, and notification de-dupe keys.
--   3. Row Level Security so a signed-in user can only touch their own fleet.
--   4. Per-user notification preferences (expiry window, service reminders).
--   5. A daily expiry/service alert job (pg_cron) that runs with the app closed.
--   6. Realtime publication for vehicles and notifications.
--
-- IMPORTANT: this script replaces the RLS policies on the four tables below.
-- Copy out any custom policies before running it.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Fleets and profiles
-- ----------------------------------------------------------------------------
create table if not exists public.fleets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'My Fleet',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  email             text,
  full_name         text,
  role              text not null default 'member' check (role in ('admin', 'member')),
  fleet_id          uuid,
  notification_prefs jsonb not null default jsonb_build_object(
    'emailNotifications', false,
    'expiryAlerts', true,
    'expiryWindow', 30,
    'maintenanceReminders', true
  ),
  created_at        timestamptz not null default now()
);

alter table public.profiles add column if not exists fleet_id uuid;
alter table public.profiles add column if not exists notification_prefs jsonb not null
  default jsonb_build_object(
    'emailNotifications', false,
    'expiryAlerts', true,
    'expiryWindow', 30,
    'maintenanceReminders', true
  );

-- Give every existing profile its own fleet, then make sure a fleet row exists.
update public.profiles set fleet_id = gen_random_uuid() where fleet_id is null;

insert into public.fleets (id, name)
select distinct on (p.fleet_id)
  p.fleet_id,
  coalesce(nullif(trim(p.full_name), ''), nullif(p.email, ''), 'My Fleet')
from public.profiles p
where p.fleet_id is not null
  and not exists (select 1 from public.fleets f where f.id = p.fleet_id)
order by p.fleet_id, p.created_at
on conflict (id) do nothing;

alter table public.profiles alter column fleet_id set not null;

create index if not exists profiles_fleet_id_idx on public.profiles (fleet_id);

-- ----------------------------------------------------------------------------
-- 2. Vehicles + notifications
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete cascade,
  fleet_id            uuid,
  registration_number text not null,
  make                text not null,
  model               text not null,
  year                integer,
  colour              text,
  insurance_expiry    date,
  road_tax_expiry     date,
  roadworthy_expiry   date,
  next_service_date   date,
  notes               text,
  created_at          timestamptz not null default now()
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  fleet_id    uuid,
  vehicle_id  uuid references public.vehicles (id) on delete cascade,
  title       text not null,
  message     text,
  type        text default 'info',
  is_read     boolean not null default false,
  dedupe_key  text,
  created_at  timestamptz not null default now()
);

alter table public.vehicles add column if not exists fleet_id uuid;
alter table public.vehicles add column if not exists next_service_date date;
alter table public.notifications add column if not exists fleet_id uuid;
alter table public.notifications add column if not exists dedupe_key text;

-- Backfill ownership from the account that created each row.
update public.vehicles v
set fleet_id = p.fleet_id
from public.profiles p
where v.fleet_id is null and v.user_id = p.id;

update public.notifications n
set fleet_id = p.fleet_id
from public.profiles p
where n.fleet_id is null and n.user_id = p.id;

-- Single-account projects can safely inherit the only fleet.
update public.vehicles
set fleet_id = (select fleet_id from public.profiles order by created_at limit 1)
where fleet_id is null and (select count(*) from public.profiles) = 1;

update public.notifications
set fleet_id = (select fleet_id from public.profiles order by created_at limit 1)
where fleet_id is null and (select count(*) from public.profiles) = 1;

create index if not exists vehicles_fleet_id_idx on public.vehicles (fleet_id);
create index if not exists notifications_fleet_id_idx on public.notifications (fleet_id);
create index if not exists notifications_vehicle_id_idx on public.notifications (vehicle_id);

-- One registration per fleet (case/whitespace insensitive). If duplicates
-- already exist the index is skipped with a notice instead of failing setup.
do $$
begin
  if not exists (
    select 1
    from public.vehicles
    where fleet_id is not null
    group by fleet_id, lower(trim(registration_number))
    having count(*) > 1
  ) then
    create unique index if not exists vehicles_fleet_registration_unique
      on public.vehicles (fleet_id, lower(trim(registration_number)));
  else
    raise notice 'Duplicate vehicle registrations exist; clean them up before the unique index can be created.';
  end if;
end $$;

-- Alerts are per user. NULL dedupe_key values (manual notifications) are
-- distinct, so they never collide with generated alerts.
drop index if exists public.notifications_fleet_dedupe_unique;

-- Earlier builds may have inserted duplicate generated alerts before the
-- unique index existed. Collapse those rows, keeping the newest message and
-- preserving unread state if any duplicate was unread.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, dedupe_key
      order by created_at desc, id desc
    ) as row_num,
    bool_and(is_read) over (partition by user_id, dedupe_key) as all_read
  from public.notifications
  where user_id is not null and dedupe_key is not null
)
update public.notifications n
set is_read = ranked.all_read
from ranked
where ranked.id = n.id
  and ranked.row_num = 1
  and n.is_read is distinct from ranked.all_read;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, dedupe_key
      order by created_at desc, id desc
    ) as row_num
  from public.notifications
  where user_id is not null and dedupe_key is not null
)
delete from public.notifications n
using ranked
where ranked.id = n.id and ranked.row_num > 1;

create unique index if not exists notifications_user_dedupe_unique
  on public.notifications (user_id, dedupe_key);

-- ----------------------------------------------------------------------------
-- 3. Helper functions used by RLS and the app
-- ----------------------------------------------------------------------------
create or replace function public.current_fleet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fleet_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- A user can change only their display name; roles are managed separately.
create or replace function public.update_my_profile_name(new_full_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  update public.profiles
  set full_name = nullif(trim(new_full_name), '')
  where id = auth.uid();
end;
$$;

create or replace function public.update_my_fleet_name(new_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned text := nullif(trim(new_name), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  if not public.is_admin() then
    raise exception 'Only fleet admins can rename the fleet.' using errcode = '42501';
  end if;

  if cleaned is null then
    raise exception 'Fleet name cannot be empty.' using errcode = '22023';
  end if;

  update public.fleets set name = cleaned where id = public.current_fleet_id();
  return cleaned;
end;
$$;

create or replace function public.update_my_preferences(new_prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  merged jsonb;
  window_days integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  select coalesce(notification_prefs, '{}'::jsonb) || coalesce(new_prefs, '{}'::jsonb)
  into merged
  from public.profiles
  where id = auth.uid();

  if merged is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;

  window_days := case
    when merged->>'expiryWindow' ~ '^\d+$' then (merged->>'expiryWindow')::integer
    else 30
  end;

  if window_days not in (7, 14, 30, 60, 90) then
    window_days := 30;
  end if;

  merged := jsonb_build_object(
    'emailNotifications', coalesce(
      case when merged->>'emailNotifications' in ('true', 'false')
        then (merged->>'emailNotifications')::boolean end,
      false
    ),
    'expiryAlerts', coalesce(
      case when merged->>'expiryAlerts' in ('true', 'false')
        then (merged->>'expiryAlerts')::boolean end,
      true
    ),
    'expiryWindow', window_days,
    'maintenanceReminders', coalesce(
      case when merged->>'maintenanceReminders' in ('true', 'false')
        then (merged->>'maintenanceReminders')::boolean end,
      true
    )
  );

  update public.profiles
  set notification_prefs = merged
  where id = auth.uid();

  return merged;
end;
$$;

revoke all on function public.update_my_profile_name(text) from public;
revoke all on function public.update_my_fleet_name(text) from public;
revoke all on function public.update_my_preferences(jsonb) from public;
grant execute on function public.update_my_profile_name(text) to authenticated;
grant execute on function public.update_my_fleet_name(text) to authenticated;
grant execute on function public.update_my_preferences(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Profiles are created automatically for new accounts
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first_user boolean;
  new_fleet_id uuid := gen_random_uuid();
  display_name text;
begin
  select not exists (select 1 from public.profiles) into is_first_user;
  display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1),
    'My Fleet'
  );

  insert into public.fleets (id, name) values (new_fleet_id, display_name);
  insert into public.profiles (id, email, full_name, role, fleet_id)
  values (
    new.id,
    new.email,
    display_name,
    case when is_first_user then 'admin' else 'member' end,
    new_fleet_id
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before this script.
do $$
declare
  account record;
  fleet uuid;
  display_name text;
begin
  for account in
    select u.id, u.email, u.raw_user_meta_data
    from auth.users u
    where not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    fleet := gen_random_uuid();
    display_name := coalesce(
      nullif(account.raw_user_meta_data ->> 'full_name', ''),
      split_part(account.email, '@', 1),
      'My Fleet'
    );

    insert into public.fleets (id, name) values (fleet, display_name);
    insert into public.profiles (id, email, full_name, role, fleet_id)
    values (
      account.id,
      account.email,
      display_name,
      case when not exists (select 1 from public.profiles) then 'admin' else 'member' end,
      fleet
    );
  end loop;
end $$;

-- Make sure at least one account can manage each fleet.
update public.profiles p
set role = 'admin'
where p.role <> 'admin'
  and not exists (
    select 1 from public.profiles a
    where a.fleet_id = p.fleet_id and a.role = 'admin'
  )
  and p.id = (
    select p2.id from public.profiles p2
    where p2.fleet_id = p.fleet_id
    order by p2.created_at
    limit 1
  );

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.fleets enable row level security;
alter table public.vehicles enable row level security;
alter table public.notifications enable row level security;

do $$
declare
  policy record;
begin
  for policy in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'fleets', 'vehicles', 'notifications')
  loop
    execute format('drop policy if exists %I on public.%I', policy.policyname, policy.tablename);
  end loop;
end $$;

-- Profiles: team members can see each other; only admins can change roles.
create policy "profiles_select_fleet"
  on public.profiles for select
  to authenticated
  using (fleet_id = public.current_fleet_id());

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin() and fleet_id = public.current_fleet_id())
  with check (public.is_admin() and fleet_id = public.current_fleet_id());

-- Fleets: read your own; admins can rename it.
create policy "fleets_select_fleet"
  on public.fleets for select
  to authenticated
  using (id = public.current_fleet_id());

create policy "fleets_update_admin"
  on public.fleets for update
  to authenticated
  using (public.is_admin() and id = public.current_fleet_id())
  with check (public.is_admin() and id = public.current_fleet_id());

-- Vehicles: full access to your fleet's rows.
create policy "vehicles_select_fleet"
  on public.vehicles for select
  to authenticated
  using (fleet_id = public.current_fleet_id());

create policy "vehicles_insert_fleet"
  on public.vehicles for insert
  to authenticated
  with check (fleet_id = public.current_fleet_id());

create policy "vehicles_update_fleet"
  on public.vehicles for update
  to authenticated
  using (fleet_id = public.current_fleet_id())
  with check (fleet_id = public.current_fleet_id());

create policy "vehicles_delete_fleet"
  on public.vehicles for delete
  to authenticated
  using (fleet_id = public.current_fleet_id());

-- Notifications: each member owns their alerts, even in a shared fleet.
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid() and fleet_id = public.current_fleet_id());

create policy "notifications_insert_own"
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid() and fleet_id = public.current_fleet_id());

create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid() and fleet_id = public.current_fleet_id())
  with check (user_id = auth.uid() and fleet_id = public.current_fleet_id());

create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (user_id = auth.uid() and fleet_id = public.current_fleet_id());

-- Do not let an admin demote the last admin of a fleet.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and new.role <> 'admin' then
    if not exists (
      select 1 from public.profiles
      where fleet_id = old.fleet_id and role = 'admin' and id <> old.id
    ) then
      raise exception 'A fleet must keep at least one admin.' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_last_admin on public.profiles;
create trigger protect_last_admin
  before update of role on public.profiles
  for each row execute function public.protect_last_admin();

-- ----------------------------------------------------------------------------
-- 6. Scheduled expiry + service alerts
-- ----------------------------------------------------------------------------
-- The app also runs this logic when it opens, so alerts appear immediately.
-- The scheduled job makes sure reminders exist even when nobody opens the app.
create or replace function public.generate_expiry_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  vehicle record;
  member record;
  document record;
  preferences jsonb;
  window_days integer;
  expiry date;
  remaining integer;
  alert_state text;
  key_expired text;
  key_soon text;
  active_key text;
  alert_title text;
  alert_message text;
  alert_type text;
  document_enabled boolean;
  generated integer := 0;
begin
  for vehicle in
    select * from public.vehicles where fleet_id is not null
  loop
    -- Alerts are per member so each person's preferences and read state are
    -- respected, even though the vehicle itself is shared.
    for member in
      select id, notification_prefs
      from public.profiles
      where fleet_id = vehicle.fleet_id
    loop
      preferences := coalesce(member.notification_prefs, '{}'::jsonb);

      for document in
        select * from (values
          ('insurance_expiry', 'Insurance', 'insurance', 'expiryAlerts', 0),
          ('road_tax_expiry', 'Road Tax', 'road tax', 'expiryAlerts', 0),
          ('roadworthy_expiry', 'Roadworthy', 'roadworthy', 'expiryAlerts', 0),
          ('next_service_date', 'Service', 'service', 'maintenanceReminders', 14)
        ) as docs(field, label, noun, pref, max_window)
      loop
        document_enabled := coalesce((preferences ->> document.pref)::boolean, true);

        window_days := case
          when document.field = 'next_service_date'
            then least(14, coalesce((preferences ->> 'expiryWindow')::integer, 30))
          else coalesce((preferences ->> 'expiryWindow')::integer, 30)
        end;

        if window_days not in (7, 14, 30, 60, 90) then
          window_days := 30;
        end if;

        expiry := nullif(to_jsonb(vehicle) ->> document.field, '')::date;
        key_expired := 'expiry:' || document.field || ':expired:' || vehicle.id;
        key_soon := 'expiry:' || document.field || ':soon:' || vehicle.id;

        if expiry is null or not document_enabled then
          delete from public.notifications
          where user_id = member.id
            and fleet_id = vehicle.fleet_id
            and dedupe_key in (key_expired, key_soon);
          continue;
        end if;

        remaining := expiry - current_date;

        if remaining < 0 then
          alert_state := 'expired';
        elsif remaining <= window_days then
          alert_state := 'soon';
        else
          alert_state := null;
        end if;

        if alert_state is null then
          delete from public.notifications
          where user_id = member.id
            and fleet_id = vehicle.fleet_id
            and dedupe_key in (key_expired, key_soon);
          continue;
        end if;

        active_key := case when alert_state = 'expired' then key_expired else key_soon end;

        delete from public.notifications
        where user_id = member.id
          and fleet_id = vehicle.fleet_id
          and dedupe_key in (key_expired, key_soon)
          and dedupe_key <> active_key;

        alert_title := case
          when document.field = 'next_service_date' and alert_state = 'expired' then 'Service Overdue'
          when document.field = 'next_service_date' then 'Service Due Soon'
          when alert_state = 'expired' then document.label || ' Expired'
          else document.label || ' Expiring Soon'
        end;

        alert_type := case when alert_state = 'expired' then 'danger' else 'warning' end;

        if alert_state = 'expired' then
          alert_message := vehicle.make || ' ' || vehicle.model || ' (' || vehicle.registration_number || ') ' ||
            case when document.field = 'next_service_date'
              then 'service is overdue.'
              else document.noun || ' has expired.'
            end;
        else
          alert_message := vehicle.make || ' ' || vehicle.model || ' (' || vehicle.registration_number || ') ' ||
            document.noun ||
            case when document.field = 'next_service_date' then ' is due in ' else ' expires in ' end ||
            remaining || ' day' || case when remaining = 1 then '' else 's' end || '.';
        end if;

        insert into public.notifications
          (fleet_id, user_id, vehicle_id, title, message, type, is_read, dedupe_key)
        values
          (vehicle.fleet_id, member.id, vehicle.id, alert_title, alert_message,
           alert_type, false, active_key)
        on conflict (user_id, dedupe_key) do update
          set title = excluded.title,
              message = excluded.message,
              type = excluded.type;

        generated := generated + 1;
      end loop;
    end loop;
  end loop;

  return generated;
end;
$$;

revoke all on function public.generate_expiry_notifications() from public;

-- Tell every fleet member when a vehicle is added. The client also writes one
-- for the creator; the unique (user_id, dedupe_key) index makes that harmless.
create or replace function public.notify_fleet_vehicle_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.fleet_id is null then
    return new;
  end if;

  insert into public.notifications
    (user_id, fleet_id, vehicle_id, title, message, type, is_read, dedupe_key)
  select
    p.id,
    new.fleet_id,
    new.id,
    'New Vehicle Added',
    new.make || ' ' || new.model || ' (' || new.registration_number || ') was added to the fleet.',
    'success',
    false,
    'vehicle:added:' || new.id
  from public.profiles p
  where p.fleet_id = new.fleet_id
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_fleet_vehicle_added on public.vehicles;
create trigger notify_fleet_vehicle_added
  after insert on public.vehicles
  for each row execute function public.notify_fleet_vehicle_added();

-- pg_cron may not be enabled on every plan; skip scheduling if unavailable.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available; schedule public.generate_expiry_notifications() another way.';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'fleet-expiry-alerts') then
      perform cron.unschedule('fleet-expiry-alerts');
    end if;

    perform cron.schedule(
      'fleet-expiry-alerts',
      '0 6 * * *',
      'select public.generate_expiry_notifications()'
    );
  end if;
exception when others then
  raise notice 'Could not schedule fleet-expiry-alerts: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'vehicles'
    ) then
      alter publication supabase_realtime add table public.vehicles;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
exception when others then
  raise notice 'Could not add tables to supabase_realtime: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- 8. Grants
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.fleets to authenticated;
grant execute on function public.current_fleet_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

revoke all on public.vehicles from anon;
revoke all on public.notifications from anon;
revoke all on public.profiles from anon;
revoke all on public.fleets from anon;

-- ============================================================================
-- After running this:
--   * Sign out and back in.
--   * Open Team → Create user. New accounts join the admin's fleet.
--   * Existing accounts each keep their own fleet. To merge them, see README.
-- ============================================================================
