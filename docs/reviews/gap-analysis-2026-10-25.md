# Gap analysis — current app vs PRD v0.1

**Date:** 25 October 2026
**Repository:** `/home/najma/Projects/Fleet-manager`
**Baseline commit:** `2cc8958` ("Brand fleet app for IP Motors and harden setup migration")
**Working tree:** uncommitted brand/UI changes in `src/`, `public/`, `index.html`,
`tailwind.config.js`, and `vite.config.js`; new `src/Components/icons.jsx` and
`docs/`. Nothing in the working tree was changed for this analysis.
**Scope:** React + Vite + Supabase PWA that exists today. The Flutter client, API,
Neon database, Docker images, and versioned migrations do not exist yet; those are
Phase 1–3 work, not regressions.

> **Historical note (25 October 2026):** This audit compared the current app with
> PRD v0.1. The PRD is now v0.3, which adds the Fleet Owner, Finance Manager,
> developer Super Admin, owner-entered driver activity, and
> vehicle/maintenance/finance records. Those additions are captured as **Proposed**
> in D-01 and D-04. The current-code findings below remain valid evidence for the
> gap to the new target, but the v0.3 decision documents take precedence on role and
> data-model detail. This note does not mark any new item approved.

## Executive summary

The current product is a capable single-page PWA with good tactical engineering in
several areas: date handling, vehicle validation, CSV formula-injection defence,
notification de-duplication, and a reasonable first-pass RLS model.

It is **not yet the product described in the PRD**. The main gaps are structural:

- authorization is fleet-scoped but not role-scoped for vehicles;
- the data model has no membership table, no foreign keys on `fleet_id`, and a
  cascade that can delete shared vehicles when a user is deleted;
- there is no audit trail, no Super Admin, no MFA, and no member lifecycle;
- the app talks directly to Supabase, so there is no API authorization layer;
- error messages deliberately expose PostgREST codes, details, and hints;
- the current setup SQL is a destructive upgrade script, not a migration workflow;
- there are no tenant-isolation or end-to-end tests.

**Finding count:** nine P0 findings are listed in §1. The requirement tables in §2
add the P1 gaps required for v1 acceptance and the P2 gaps that can follow launch.

## Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Security, data-loss, or architectural blocker. Do not carry this design into Phase 1. |
| **P1** | Required by PRD v1 acceptance criteria. |
| **P2** | Important for scale, polish, or operations, but not a launch blocker. |

---

## 1. Critical findings (P0)

### GAP-01 — Any fleet member can create, edit, and delete vehicles

**Evidence:** RLS policies only check `fleet_id`, not role:
`supabase/schema.sql:565-579`. The UI shows **Add Vehicle** to everyone
(`src/Components/sidebar.jsx:25`) and shows **Edit** and **Delete** on every vehicle
(`src/Pages/vehicleDetail.jsx:128-137`).

**Impact:** The PRD's Fleet Member / Read-only Member distinction does not exist in
practice. A "read-only" role cannot be introduced safely until write policies check
role or permission. This violates §6 ("Hiding a screen or button in the client is
not authorization") and acceptance criterion 2.

**Required change:** Add a permission model and enforce it in RLS **and** the API.
Do not rely on UI gating. See D-01 and D-04.

**Target decision (25 October 2026):** Fleet Members may add/edit but not delete or
restore; Fleet Managers and Fleet Admins may delete/restore. The current app still
contradicts this until Phase 1 enforcement lands.

---

### GAP-02 — Only two roles exist, and they are not the PRD roles

**Evidence:** `profiles.role` is constrained to `('admin', 'member')`
(`supabase/schema.sql:34`). `is_admin()` checks only `role = 'admin'`
(`supabase/schema.sql:228-239`). The Team page exposes only Admin/Member
(`src/Pages/Team.jsx:288-298, 352-366`).

**Impact:** Fleet Manager, Fleet Member, Read-only Member, and Super Admin are
absent. There is no place to store fleet policy or platform roles. Acceptance
criteria 1 and 3 cannot pass.

**Required change:** Introduce `fleet_memberships` with a role enum and a separate
`platform_admins` table. See D-01/D-04.

---

### GAP-03 — Deleting a user can delete shared fleet vehicles

**Evidence:** `vehicles.user_id references auth.users (id) on delete cascade`
(`supabase/schema.sql:76`). `notifications.user_id` and `profiles.id` also cascade
(`supabase/schema.sql:93`, `:31`).

**Impact:** Once member removal exists (or an account is deleted for any reason),
every vehicle the member created is deleted from the fleet. This directly conflicts
with §7.1 ("membership changes must not orphan records") and the retention
requirement. It is a latent data-loss bug today because there is no removal UI, but
the service-role key or dashboard can trigger it.

**Required change:** `vehicles.created_by` → `ON DELETE SET NULL` or `RESTRICT`,
never cascade. Prefer soft delete (`deleted_at`) and an ownership/transfer flow.
See D-04.

---

### GAP-04 — Tenant columns have no foreign keys and vehicle `fleet_id` is nullable

**Evidence:** `profiles.fleet_id uuid` has no `references public.fleets`
(`supabase/schema.sql:35`). `vehicles.fleet_id uuid` has no FK
(`supabase/schema.sql:77`). `notifications.fleet_id uuid` has no FK
(`supabase/schema.sql:94`). Only `profiles.fleet_id` is later set `NOT NULL`
(`supabase/schema.sql:67`).

**Impact:** Orphan rows and cross-fleet references are possible. RLS becomes the
only integrity control. The PRD explicitly requires every fleet-owned row to have a
non-null `fleet_id`, a foreign key, and reviewed deletion rules (§9, §6).

**Required change:** `fleet_id NOT NULL REFERENCES fleets(id) ON DELETE RESTRICT`
on every tenant table; add `NOT NULL` to `vehicles.user_id` or replace it with
`created_by`; add a migration that fails closed on orphans.

---

### GAP-05 — No audit trail

**Evidence:** No audit table or write path exists in `supabase/schema.sql`. The
vehicle detail "History" card is static: it shows creation and current status only
(`src/Pages/vehicleDetail.jsx:203-223`), not real events.

**Impact:** Role changes, member removal, exports, and support access are not
recorded. The PRD requires an immutable audit trail (§6, §11) and audit of exports
(§6). The "History" card is also misleading because it looks like an audit log.

**Required change:** Append-only `audit_events` with actor, target, action, reason,
time, correlation ID, and before/after where appropriate; no update/delete grants;
API writes events in the same transaction. See D-04.

---

### GAP-06 — No Super Admin, MFA, or support-access capability

**Evidence:** No platform role, MFA configuration, support-access table, or
impersonation prevention exists. Auth is Supabase email/password
(`src/lib/authContext.jsx:36-61`). The only privileged path is the
`admin-create-user` Edge Function (`supabase/functions/admin-create-user/index.ts`).

**Impact:** Acceptance criterion 3 cannot pass. The current Edge Function uses a
service-role key, which is the opposite of a tightly controlled support model.

**Required change:** Separate platform administration, require MFA, implement
break-glass support access with audit, and never expose service-role credentials to
clients or general admin flows. See D-01/D-02.

---

### GAP-07 — User-facing errors expose technical internals

**Evidence:** `describeError()` appends PostgREST `code`, `details`, and `hint` to
every message (`src/lib/errors.js:6-16`). Login, registration, and reset-password
render raw Supabase `error.message` (`src/Pages/Login.jsx:34-36`,
`src/Pages/Register.jsx:48-50`, `src/Pages/ResetPassword.jsx:37-39`). The error
boundary prints the raw exception (`src/Components/AppErrorBoundary.jsx:33-35`).
Setup failures print SQL-editor instructions and schema-cache codes
(`src/lib/fleetScope.js:32-47`).

**Impact:** Directly violates §8: no raw SQL, stack traces, internal hostnames, or
unfiltered server responses. It also leaks implementation detail that helps
attackers.

**Required change:** Error envelope with a stable code, a plain-language message,
a next step, and a correlation ID. Keep technical detail in logs only. See D-06.

---

### GAP-08 — The database setup is a destructive upgrade script, not a migration workflow

**Evidence:** `supabase/schema.sql` is 896 lines, is described as an upgrade script,
and drops/recreates every RLS policy (`supabase/schema.sql:15-16, 521-533`). It also
deduplicates and deletes notification rows (`:180-210`), conditionally drops the
unique registration index (`:155-171`), and conditionally rewrites legacy data
(`:142-149, 444-511`). There is no `supabase/migrations/` directory, no migration
ledger, no CI, and no staging configuration.

**Impact:** The PRD explicitly says this script must not be blindly replayed against
production (§2, §9). There is no forward-only history, no reviewed change process,
and no rollback path. Acceptance criterion 8 cannot pass.

**Required change:** Adopt a versioned migration tool, separate migration and
runtime DB roles, CI checks, staging rehearsal, backups/PITR, and a documented
rollback. See D-03/D-04.

---

### GAP-09 — No tenant-isolation or authorization tests

**Evidence:** The only tests are unit tests for helpers:
`src/lib/dates.test.js`, `vehicleStatus.test.js`, `vehicleHelpers.test.js`,
`vehicleValidation.test.js`, `preferences.test.js`, `csv.test.js`. There are no
RLS tests, API tests, end-to-end tests, or CI workflows.

**Impact:** The PRD's success measure "unauthorized cross-fleet reads and writes are
denied in automated security checks" cannot be demonstrated. The current model has
never been adversarially tested with guessed IDs across fleets.

**Required change:** Add a two-fleet test fixture and CI tests for every table and
endpoint: select/insert/update/delete with own, other, and guessed IDs; export
scope; notification scope; role escalation; last-admin protection. See D-03/D-05.

---

## 2. Requirement-by-requirement gaps

### 7.1 Accounts and onboarding

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Sign in / sign out / reset | Implemented via Supabase Auth | `src/lib/authContext.jsx:36-61`; `src/Pages/Login.jsx`, `ResetPassword.jsx` | No MFA, no session-revocation UI, no forced password change for admin-created accounts | P1 |
| New fleet via approved onboarding | Every signup creates a new fleet and becomes admin | `supabase/schema.sql:354-388`; `src/Pages/Register.jsx:40-63` | Self-service, unapproved, creates orphan fleets for unconfirmed signups. No approval, no request status | P1 |
| Invite/create members within authority | Admin-created account with a typed temporary password | `src/Pages/Team.jsx:102-143`; `admin-create-user/index.ts:95-104` | No invite/accept, no expiry, no email verification of the invite, no audit, plaintext temp password shared out-of-band | P1 |
| Clear lifecycle actions/messages | Role change is immediate; no confirm dialog | `src/Pages/Team.jsx:145-179` | No confirmation for demotion; no suspend/remove/reinstate; no outcome reference | P1 |
| Membership changes do not orphan records | No membership model; cascade risk | GAP-03 | Data loss risk | P0 |

### 7.2 Fleet and team management

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| View members, role, status, invitation state | Member list with name/email/role/joined | `src/Pages/Team.jsx:54-88, 310-378` | No status (active/invited/suspended), no invitation state, no last-active | P1 |
| Change roles / revoke access | Admin can change role only | `src/Pages/Team.jsx:145-179` | No revoke, no suspend, no audit, no notification to the affected user | P1 |
| No active membership → recovery path | Setup errors only | `src/lib/fleetScope.js:56-72` | Technical message, no "contact your admin"/support path | P1 |
| Fleet settings only by Fleet Admin | Fleet name only; admin-gated via RPC | `src/Pages/settings.jsx:101, 303`; `schema.sql:259-283` | No timezone, alert defaults, member policy, export policy; name validation is client-only (60 chars) | P1 |
| Last admin protected | Trigger blocks demotion of the last admin | `supabase/schema.sql:604-639` | Does not cover account deletion, suspension, or fleet transfer; no ownership concept | P1 |

### 7.3 Vehicle records

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| CRUD according to role | All members can CRUD | GAP-01 | No role enforcement | P0 |
| Required fields and date validation | Client-side validation with sensible limits | `src/lib/vehicleValidation.js:18-66`; `src/Components/VehicleForm.jsx` | No server/API validation; DB accepts any date/year/length | P1 |
| Duplicate registration within fleet, case/whitespace insensitive | App normalises to uppercase; DB unique on `(fleet_id, lower(trim(...)))` | `src/Pages/AddVehicle.jsx:64-100`; `schema.sql:155-171` | The unique index is silently skipped if legacy duplicates exist; app check races between clients; duplicate check fetches all registrations | P1 |
| Track the four dates and notes | Implemented | `schema.sql:83-87`; `VehicleForm.jsx` | No renewal history, no per-document reference/notes; no `updated_at` | P2 |
| Search/filter/sort | Search by registration/make/model/year; status filter; many sorts | `src/Pages/Vehicles.jsx:78-108` | No make/model dropdown, no date-range filter, no "upcoming/expired" range; all filtering is client-side | P2 |
| Confirm destructive actions; report outcome | Vehicle delete has a confirm dialog | `src/Pages/vehicleDetail.jsx:232-240` | Silent redirect on success (no "Vehicle deleted"); notification delete is immediate; edit success has no message | P1 |

### 7.4 Dashboard and reports

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Totals + due soon/expired/up-to-date | Four stat cards | `src/Pages/Dashboard.jsx:56-107` | "Due soon" is hard-coded to 30 days while alerts are configurable (7/14/30/60/90); missing dates are ignored and count as Active; a vehicle is counted once by its first failing check | P1 |
| Open a count to see matching records | Not implemented | `src/Components/statCard.jsx` has no link | Cards are not clickable; no filtered list route | P1 |
| Date/status report summaries + exports | Status pie, rolling 12-month registrations chart, CSV, print | `src/Pages/reports.jsx:69-88, 110-117` | No date-range filter; "monthly registrations" is based on `created_at`, not a registration date; no per-vehicle report filtering | P1 |
| CSV formula-injection safe and scoped | Implemented | `src/lib/csv.js:1-21`; queries scoped via `applyFleetScope` | Good. Export is not audited and cannot be, because it is client-side | P1 (audit) |
| Empty states explain next action | Implemented on dashboard, vehicles, reports, notifications | `EmptyState` usage across pages | Good, though dashboard empty state is plain text rather than the shared component | P2 |

### 7.5 Notifications and reminders

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| In-app alerts with per-user read state | Implemented; per-user rows and read state | `src/lib/notificationService.js`; `src/Pages/Notifications.jsx` | Good foundation | — |
| De-duplicate and update/clear on renewal | Unique `(user_id, dedupe_key)`; state keys; delete stale keys | `schema.sql:212-213`; `notificationService.js:87-198`; `schema.sql:646-779` | Good. But client and DB both generate; message wording and window logic are duplicated and can drift | P2 |
| Configurable alert windows | 7/14/30/60/90; service capped at 14 | `src/lib/preferences.js:1`; `notificationService.js:115-117` | Dashboard/status does not use the user's window; service cap is undocumented in the PRD | P1 |
| Reliable when app is closed | Supabase `pg_cron` daily at 06:00 UTC | `schema.sql:820-843`; `scheduled-alerts.sql` | No job monitoring, no heartbeat, no retry visibility; Neon does not provide Supabase's `pg_cron`/Realtime stack as a drop-in, so this must be redesigned (confirm during the Neon feature check) | P0 (target) |
| Email/push deferred | Email toggle disabled with "coming soon" | `src/Pages/settings.jsx:327-333` | Correctly scoped out | — |

### 7.6 Mobile application

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Flutter Android/iOS app | Not started | — | Phase 2 work | — |
| Installable distribution | PWA install prompts, manifest, offline shell | `vite.config.js:32-105`; `InstallPrompt.jsx` | PWA only; no store/internal-testing pipeline | P1 (Phase 3) |
| Small-screen core workflows | Responsive layouts, mobile nav, safe-area padding | `src/Layouts/dashboardLayout.jsx`; `MobileNav.jsx`; `Vehicles.jsx:214-273` | Reasonable web responsiveness; not a substitute for native keyboard/safe-area testing | P1 |
| Loading/empty/offline/permission/retry states | Loading and empty states exist; offline banner exists | `src/Layouts/dashboardLayout.jsx:56-64`; pages | No distinct permission state, no retry control for failed loads, no "last refreshed", no offline data | P1 |
| Offline read (if enabled) with last-refresh time | Not enabled | `vite.config.js:91-104` excludes Supabase from cache | No data cache; the offline banner is honest, which is good | P2 |
| No offline writes | Correctly not implemented | Offline banner says saves will fail | Good alignment with §5 | — |

### 8. Human-readable messages and error handling

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Plain language, no internals | Not met | GAP-07 | Codes, hints, raw messages, SQL instructions are shown | P0 |
| State what happened, whether saved, next step | Partly met | Add page has success text; most saves redirect silently | Inconsistent success/partial-result messaging | P1 |
| Correlation ID for support | Not implemented | No request ID or log pipeline | Cannot give a support reference | P1 |
| Logs omit secrets/PII | Client only uses `console.warn` with `error.message`; no server logs yet | `notificationService.js`, pages | No structured logging or redaction policy | P1 |
| Network vs server vs unknown result | Not distinguished | Offline banner only; `describeError` generic | "Failed to fetch" can leak through; timeouts are unhandled | P1 |

### 9. Data and backend requirements

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Neon PostgreSQL target | Supabase Postgres today | `.env`, `supabaseClient.js` | No connectivity/feature spike yet | Phase 0/1 |
| Normalised fleets/users/memberships/vehicles/documents/notifications/audit | Partial: fleets/profiles/vehicles/notifications | `schema.sql` | No membership table, no audit, no document history; role encoded on profile | P0 |
| FKs, uniqueness, indexes, deletion rules reviewed | Partial | `schema.sql:151-171`; missing FKs on `fleet_id` | GAP-04; no `updated_at`; no soft delete/retention | P0 |
| Separate dev/staging/prod | No staging configuration | `.env` only | Risk of testing against production | P1 |
| No DB/service credentials in clients | Anon key only in client; service role in Edge Function env | `src/lib/supabaseClient.js`; Edge Function | Good. Ensure the new API never ships DB credentials | — |
| API authenticates/authorizes/validates/audits | No API; client calls PostgREST directly | `src/lib/supabaseClient.js` | Central P0 gap for Phase 1 | P0 |
| RLS defense in depth with safe tenant context | RLS exists, but no pooled API role design | `schema.sql:218-239, 514-601` | Policies depend on `auth.uid()`; target API needs `SET LOCAL` context and a non-owner role | P0 |
| Pooling, bounded transactions, idempotent jobs | N/A today | — | Design requirement | Phase 1 |
| Versioned forward-only migrations | Not implemented | `schema.sql` | GAP-08 | P0 |
| Staged migration with reconciliation/rollback | Not planned | — | Phase 3; needs inventory | P1 |

### 10. Hosting and Docker

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Docker images for API and worker | None | — | Phase 1 | P1 |
| Flutter built/distributed separately | None | — | Phase 2/3 | P1 |
| Hosting provider selected | Vercel config for the static PWA only | `vercel.json` | No API/worker host, no region/private networking plan | P1 |
| Stateless scaling, pooling, rate limits, queues, load tests | None | — | Phase 1/3 | P1 |
| Health checks, logs, metrics, alerting, rollback | None | — | Phase 1 | P1 |
| Backup/restore/incident/maintenance plans | Not documented | — | Phase 3 | P1 |
| Secrets in host secret manager | `.env` is git-ignored | `.gitignore` | Good local hygiene; no production secret process | P1 |

### 11. Security, privacy, and audit

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Least privilege in client/API/DB | API absent; any member can write vehicles | GAP-01/02 | No role-scoped authorization; fix in D-01/D-04 | P0 |
| MFA for Super Admin; assess for Fleet Admin | None | GAP-06 | No MFA; require it for Super Admin | P1 |
| Session expiry/revocation, rate limits, IDOR protection | Supabase session defaults; no app-level rate limits; IDOR mostly blocked by RLS but untested | `authContext.jsx`; `fleetScope.js` | No tests, no explicit revocation, no MFA | P1 |
| Audit administrative/sensitive actions | None | GAP-05 | No audit trail | P0 |
| Data minimisation/retention/deletion | Not defined | GAP-05 | Retention and deletion rules missing | P1 |
| No secrets in source/logs/screenshots | `.env` ignored; `.env` present locally | `.gitignore` | Verify `.env` is not tracked; redact logs | P2 |
| Security review and tenant-isolation plan | None | — | No formal review or isolation tests | P1 |

### 12. Non-functional requirements

| Requirement | Current state | Evidence | Gap / risk | Priority |
|---|---|---|---|---|
| Reliability / know whether saved | Partial | Silent redirects after most saves | Needs idempotency and explicit outcomes | P1 |
| Performance target | Not measured | All lists `select *` with no pagination | No baseline; unbounded queries | P1 |
| Scale planning | Not measured | — | Needs D-05 | P1 |
| Accessibility | Partial: skip link, ARIA labels, some 44 px targets | `dashboardLayout.jsx:44-49`; nav components | Charts have no accessible table; no documented WCAG target; not tested with a screen reader | P1 |
| Localisation | English, all strings inline in JSX | Pages/components | Cannot be localised cheaply; no central catalog | P2 |
| Observability | `console.warn` only | Various pages | No metrics/logs/alerts | P1 |
| Compatibility | No minimum OS/device matrix | — | Needed before Flutter | P1 |

---

## 3. Data-model defects to fix in the target schema

| Defect | Evidence | Consequence | Fix |
|---|---|---|---|
| `profiles.fleet_id` has no FK | `schema.sql:35` | Orphan profiles; RLS returns no rows or wrong scope | `REFERENCES fleets(id)` |
| `vehicles.fleet_id` nullable, no FK | `schema.sql:77` | Legacy/orphan vehicles; accidental global rows | `NOT NULL REFERENCES fleets(id)` |
| `notifications.fleet_id` nullable, no FK | `schema.sql:94` | Orphan alerts; notifications can outlive fleet | `NOT NULL REFERENCES fleets(id) ON DELETE CASCADE` |
| `vehicles.user_id` cascades from `auth.users` | `schema.sql:76` | Shared vehicles deleted with a member | `created_by ... ON DELETE SET NULL` or `RESTRICT` |
| Role on `profiles` | `schema.sql:34` | One fleet per user; no status/invite fields | `fleet_memberships` table |
| No `updated_at` on vehicles | `schema.sql:88` | Cannot detect concurrent edits or show useful history | Add `updated_at` + optimistic concurrency |
| No soft delete/retention | `schema.sql:74-89` | Hard deletes are unrecoverable; no audit context | `deleted_at`, retention policy |
| Unique registration index can be absent | `schema.sql:155-171` | Duplicate registrations possible; app check is racy | Fail migration if duplicates exist; create index unconditionally after cleanup |
| No fleet timezone | `schema.sql:24-28` | "Expired today" differs by device timezone | Add `fleets.timezone`; compute status server-side |
| No fleet status/onboarding | `schema.sql:24-28` | Cannot represent pending/suspended/closed fleets | Add `status`, `created_by`, timestamps |
| No membership status | `schema.sql:30-43` | Cannot suspend or invite | `status`, `invited_at`, `joined_at`, `removed_at` |
| `protect_last_admin` only on update of role | `schema.sql:637-639` | Delete/suspend/transfer paths unprotected | Enforce in API and DB; add ownership transfer |

---

## 4. Reusable assets (do not rebuild)

These are sound and should be carried into the API/Flutter design, either as
reference implementations or shared test fixtures:

- **Date semantics:** local-midnight parsing treats an expiry date as valid through
  the end of that day (`src/lib/dates.js`; tests in `dates.test.js`). Reuse the rule,
  but move it server-side and add a fleet timezone.
- **Status derivation:** deterministic first-failing-check logic
  (`src/lib/vehicleStatus.js`) and document row states (`vehicleHelpers.js`). Reuse
  the precedence, but resolve the 30-day hard-coding and missing-date rule.
- **Validation:** registration/make/model/year/date/notes limits
  (`src/lib/vehicleValidation.js`). Port to the API schema (Zod/TypeBox) and keep the
  client copy for instant feedback.
- **CSV safety:** formula-prefix neutralisation, quote escaping, UTF-8 BOM
  (`src/lib/csv.js`). Reuse and add server-side generation for auditability.
- **Alert de-duplication:** `(user, dedupe_key)` unique index, state keys, stale-key
  cleanup, read-state preservation on update (`notificationService.js`;
  `schema.sql:646-779`). Reuse the semantics, move generation to the worker.
- **RLS shape:** fleet-scoped `USING`/`WITH CHECK` pattern and last-admin trigger
  (`schema.sql:514-639`). Reuse the pattern with role predicates and a non-owner
  runtime role.
- **PWA shell:** manifest, offline shell, install prompts, service-worker update
  handling (`vite.config.js`; `InstallPrompt.jsx`). Keep during transition.
- **Empty-state and loading patterns:** consistent and accessible enough to reuse
  as UX reference.

## 5. Test coverage gaps

| Area | Current coverage | Needed |
|---|---|---|
| Date/status/validation/CSV/preferences | Unit tests exist | Keep; add timezone and missing-date cases |
| RLS / tenant isolation | None | Two-fleet fixtures; read/write/delete/export/notification matrix |
| Role authorization | None | Every role × every action, including last-admin and self-demotion |
| Auth/session | None | Expiry, revocation, MFA challenge, invite acceptance, forced reset |
| API contract | None | OpenAPI schema tests; error-envelope tests |
| Migration | None | Dry-run against production-shaped copy; row-count reconciliation; rollback rehearsal |
| Mobile UI | None | Flutter widget tests; device matrix; accessibility scans |
| Performance | None | k6 load profile with p95/p99 thresholds |
| Error UX | None | Assert no codes/hints/hostnames appear in user-visible text |

## 6. Recommended remediation sequence

### Before Phase 1 (design changes)

1. Sign D-01 (roles, membership, legacy mapping, Super Admin).
2. Sign D-02 (identity provider) and run the spike.
3. Approve D-04 (target schema, RLS context, audit, retention).
4. Approve D-05 (scale, SLO, environments).
5. Decide the PWA transition and Flutter distribution in D-06.

### Phase 1 (backend foundation)

1. Create the new schema with `fleet_memberships`, FKs, `NOT NULL` fleet columns,
   `created_by` without cascade, `updated_at`, soft delete, audit, invitations.
2. Implement the API with JWT validation, membership lookup per request, role
   checks, Zod input validation, idempotency keys, and structured errors.
3. Set up the `app_rw` DB role, `FORCE RLS`, `SET LOCAL` context, pooling, and
   statement timeouts.
4. Move notification generation to the worker with advisory locks and monitoring.
5. Add CI: lint, unit, integration, RLS isolation, migration dry-run, Docker build.
6. Migrate a sanitized copy and run the isolation/role test suite.

### Phase 2 (Flutter MVP)

1. Reuse the status/validation/date rules through the API, not duplicated client
   logic.
2. Implement the central message catalog and correlation-ID display.
3. Gate UI by permissions returned by the API, but never rely on that gating.
4. Add offline read-only cache with "last updated" only if D-06 approves it.
5. Add accessibility and small-screen acceptance checks.

### Phase 3 (production readiness)

1. Reports with date filters and server-generated, audited CSV.
2. Load, security, restore, and store/internal-distribution checks.
3. Production migration with backup, reconciliation, freeze window, and rollback
   rehearsal.

## 7. What not to do

- Do not bolt the five PRD roles onto `profiles.role` and call it done; the
  one-fleet-per-profile model and missing membership status will block invitations,
  suspension, and multi-fleet growth.
- Do not add role checks only in React. The API and RLS must enforce them.
- Do not run the existing `schema.sql` against production again; it drops policies
  and can delete duplicate notifications.
- Do not connect the new API to Neon as the database owner; that bypasses RLS.
- Do not keep `vehicles.user_id` cascading from `auth.users`.
- Do not expose `describeError` output in the Flutter or PWA UI.
- Do not build push/email, offline writes, or telematics in v1.

## 8. Traceability

| PRD acceptance criterion | Current status | Blocking gaps |
|---|---|---|
| 1. Sign-in returns only assigned memberships/permissions | Partial (fleet scope only) | GAP-01, GAP-02, GAP-06 |
| 2. Fleet Admin manages members/vehicles; members cannot self-elevate | Partial (admin role gate works for profiles) | GAP-01, GAP-02, GAP-05 |
| 3. Super Admin distinct, MFA, audited | Missing | GAP-05, GAP-06 |
| 4. Cross-fleet requests fail even with guessed IDs | Likely for vehicles due to RLS; untested; no export/notification adversarial tests | GAP-04, GAP-09 |
| 5. Dates drive correct dashboard statuses and de-duplicated alerts | Partial; status window/timezone inconsistent; alerts duplicated in client and DB | GAP-08, dashboard/notification gaps |
| 6. Flutter supports agreed OS versions and core flows | Missing | Phase 2; D-06 |
| 7. Plain-language messages, no internals | Fails | GAP-07 |
| 8. Production migration verifiable and restorable | Missing | GAP-08; D-04 |
| 9. Docker health checks + load/latency targets | Missing | Phase 1/3; D-03/D-05 |
