# IP Motors Fleet Manager

A fleet document, compliance, and maintenance manager built with React + Vite
and Supabase. It runs as an installable PWA on Android and iOS and can be
wrapped with Capacitor later if you need store builds.

## What's inside

| Area | Notes |
| --- | --- |
| Auth | Email + password via Supabase (`src/lib/authContext.jsx`) |
| Fleets | Team members share vehicles, alerts, and reports |
| Vehicles | CRUD, validation, duplicate checks, search / filter / sort |
| Documents | Insurance, road tax, roadworthy, and next-service dates |
| Dashboard | Compliance stats, fleet health, and "needs attention" |
| Notifications | Expiry/service alerts, unread filter, live refresh |
| Reports | Charts, CSV (formula-safe), and print/PDF layout |
| Team | Admin user creation + role management (`/team`) |
| Settings | Profile, fleet name, and saved notification preferences |
| PWA | Offline app shell, install prompt, safe-area support |

## First-time setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Environment variables** — create `.env`:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

   Only the anon key belongs in the browser. Never ship the service-role key.

3. **Database setup (required)**

   Open Supabase → SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql).
   It creates the `fleets`, `profiles`, `vehicles`, and `notifications` tables
   (or upgrades the existing ones), enables RLS, adds notification preferences,
   and schedules the daily alert job.

   If `pg_cron` is unavailable, enable it under **Database → Extensions**, then
   run [`supabase/scheduled-alerts.sql`](supabase/scheduled-alerts.sql) to
   install just the schedule.

   To confirm the migration completed in the same Supabase project used by
   `.env`, run [`supabase/verify-setup.sql`](supabase/verify-setup.sql). It
   should return non-NULL table names, the required columns, ownership counts,
   and row-level security enabled on all four tables.

4. **Deploy the admin function**

   ```bash
   npm install -g supabase
   supabase login
   supabase link --project-ref <project-ref>
   supabase functions deploy admin-create-user
   ```

5. **Configure password-reset redirects** — in Supabase → Authentication →
   URL Configuration, add the app URLs ending in `/reset-password` to the
   allowed redirect URLs. For local development, allow
   `http://localhost:5173/reset-password`; if Vite falls back to port 5174,
   allow `http://localhost:5174/reset-password` as well. Add the production app
   origin too.

6. **Run it**

   ```bash
   npm run dev        # local development
   npm run build      # production build
   npm run preview    # preview the build
   npm run lint       # oxlint
   npm run test       # vitest unit tests
   ```

## How access works

- Every account belongs to a **fleet**. A self-service signup starts a new fleet
  and is its admin. **Team → Create user** instead places the new account in the
  admin's fleet with the chosen role, so staff share vehicles, alerts, and
  reports.
- RLS allows only `fleet_id = current_fleet_id()` for vehicles and
  notifications. Queries in the app also filter by fleet, so a missing migration
  fails visibly instead of exposing another fleet.
- Admins can change roles. The database refuses to demote the last admin.
- Settings are stored on the profile (`notification_prefs`), not in
  `localStorage`, so they follow the user across devices.

Self-service signup is still enabled by default. If accounts should only be
created by an admin, turn off **Authentication → Providers → Email → Allow new
users to sign up** in Supabase. The Team page continues to work through the
service-role Edge Function.

### Upgrading an existing project

Run `supabase/schema.sql` again. It is safe to rerun and now upgrades projects
that predate fleets (where `vehicles` has no `user_id`, `fleet_id`, or
`next_service_date`).

- Existing vehicles and notifications are assigned to the earliest admin's
  fleet, so the current fleet stays visible after RLS is enabled. If the schema
  finds duplicate registration numbers during that adoption, it drops the unique
  registration index with a notice instead of failing; clean up the duplicates
  and rerun the script.
- Existing accounts each keep their own fleet so nobody gains access to data
  they did not have before. Only accounts created through **Team → Create user**
  join the admin's fleet. To merge a member into the owner's fleet:

```sql
-- Find the admin's fleet id
select email, fleet_id from public.profiles where role = 'admin';

-- Move one member (replace the two UUIDs)
update public.vehicles      set fleet_id = '<FLEET_ID>' where user_id = '<MEMBER_ID>';
update public.notifications set fleet_id = '<FLEET_ID>' where user_id = '<MEMBER_ID>';
update public.profiles      set fleet_id = '<FLEET_ID>' where id      = '<MEMBER_ID>';
```

After running the migration, run `supabase/verify-setup.sql` and check that:

- all four table names are non-NULL;
- `vehicles` has `user_id`, `fleet_id`, and `next_service_date`;
- `notifications` has `fleet_id` and `dedupe_key`;
- row-level security is enabled on all four tables;
- each auth user has a profile and there are no vehicles without a fleet.

Then sign out and back in so the app reloads the cached profile. If the Team
page still reports setup needed, check the browser's Network tab for
`/rest/v1/profiles`. A `PGRST205` response means PostgREST still has a stale
schema cache; run `notify pgrst, 'reload schema';` and reload the app.

If the unique registration index was skipped because of duplicates, clean those
up and rerun the script.

## Alerts and preferences

- The app checks alerts when it opens or returns to the foreground.
- The `fleet-expiry-alerts` pg_cron job runs `generate_expiry_notifications()`
  daily at 06:00 UTC, so alerts are created even when nobody opens the app.
- Alerts are per member and de-duplicated by `(user_id, dedupe_key)`, so one
  person's preferences and read state do not affect the rest of the fleet.
  Messages refresh as the expiry date approaches, and alerts are removed when a
  document is renewed or a category is turned off.
- Settings control the alert window (7/14/30/60/90 days), expiry alerts, and
  service reminders. Email delivery is not connected yet and is shown as
  disabled in the UI.
- Reminders are in-app only. Push notifications would need a native wrapper
  (for example Capacitor) plus a push service.

## Installing on a phone

- **Android (Chrome):** open the site → menu → *Install app* (or use the in-app
  install banner).
- **iOS (Safari):** open the site → Share → *Add to Home Screen*.

Both platforms get a standalone, offline-capable shell. This repository does
not produce App Store or Google Play packages.

## Architecture notes

- All pages are lazy-loaded. The main bundle is split from the reports/chart
  bundle and stays well under the previous 500 kB warning.
- Supabase Realtime refreshes the dashboard, vehicle list, notification page,
  and unread badge when another team member changes data.
- Dates are stored as date-only values and parsed as **local** midnights, so a
  document expiring today is not marked expired.
- CSV exports neutralise cells starting with `=`, `+`, `-`, or `@` to prevent
  spreadsheet formula injection.
- Unit tests cover date handling, compliance status, the rolling 12-month
  report, preferences, validation, and CSV escaping.

## Troubleshooting

- **"Your account is not fully set up"** — run `supabase/schema.sql`, sign out,
  and sign back in. If `public.profiles` is still missing, confirm the SQL ran
  successfully in the project URL configured for this app. If the table exists
  but REST still says it is missing from the schema cache, run
  `notify pgrst, 'reload schema';` in the Supabase SQL Editor and reload the app.
- **Team page says setup is needed** — `profiles`, `fleets`, or the ownership
  columns are missing; run the current `supabase/schema.sql`, then
  `supabase/verify-setup.sql`.
- **"Create user" fails** — deploy `admin-create-user` and confirm the function
  has `SUPABASE_SERVICE_ROLE_KEY` in its environment.
- **Password reset link does not open the new-password screen** — add the exact
  local and production `/reset-password` URLs to Supabase Auth's allowed redirect URLs.
- **Alerts do not appear while the app is closed** — check that `pg_cron` is
  enabled and `cron.job` contains `fleet-expiry-alerts`.
- **A new deployment shows a loading error** — the error boundary offers a
  reload; the service worker may be serving an older chunk.
