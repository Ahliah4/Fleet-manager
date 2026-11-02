# Product Requirements Document

## IP Motors Fleet Manager

**Status:** Draft for review  
**Version:** 0.1  
**Date:** 22 October 2026  
**Product owner:** Najma Mustafa

## 1. Product summary

IP Motors Fleet Manager helps small and growing fleet teams keep vehicle records, document renewals, servicing, team access, and operational reports in one place. The product is currently a React web app with an installable PWA and a Supabase backend. The intended direction is a mobile-first Flutter app, backed by a secure API and Neon-hosted PostgreSQL, with Docker used to package backend services for deployment.

The product must support multiple fleets (tenants) while ensuring every member can only access the data allowed by their role. It must explain successful actions and failures in clear, human-readable language.

## 2. Background and current state

The existing app already includes:

- Email and password sign-in, registration, and password reset.
- Fleets, member profiles, and admin-created team accounts.
- Vehicle records with registration, make, model, year, colour, notes, and document/service dates.
- Vehicle search, filtering, sorting, validation, and duplicate-registration checks.
- Dashboard summaries for fleet health and expiring or expired documents.
- In-app expiry and service notifications, unread state, and saved preferences.
- Reports with charts, CSV export, and print/PDF layout.
- Team and settings screens.
- Realtime updates and an installable PWA shell.

The current backend uses Supabase Auth, Postgres, Row Level Security (RLS), Realtime, an Edge Function, and `pg_cron`. The Supabase project and its schema have had access/setup issues. The current setup SQL is in `supabase/schema.sql`; it is an upgrade script that replaces selected RLS policies, so it must not be blindly replayed as a fresh migration against production.

## 3. Vision and direction

Deliver a dependable fleet operations product that works well on phones first, remains usable on desktop, and can grow from one small team to many fleets without weakening tenant isolation.

### Product direction

1. Stabilize and document the existing product and its data model.
2. Agree roles, permissions, account ownership, and tenant rules before implementation.
3. Build the mobile-first client in Flutter and reach feature parity with the agreed v1 scope.
4. Move backend responsibilities behind a documented API and use Neon PostgreSQL as the managed database.
5. Package backend services and scheduled workers with Docker; deploy them to a selected hosting provider.
6. Migrate existing records and accounts only after the new identity and data-access design is reviewed and migration recovery is planned.

The React PWA may remain available during the transition. It should not be retired until the Flutter app has passed acceptance checks and users have a safe migration path.

## 4. Goals

- Make the core fleet workflows fast and clear on Android and iOS.
- Preserve vehicle, team, notification, and reporting capabilities that are still needed.
- Enforce role-based access in the API and database, including tenant isolation through RLS.
- Introduce a platform-level Super Admin role with tightly controlled support access.
- Make success, validation, permission, connectivity, and server errors understandable to non-technical users.
- Establish version-controlled database migrations, a recoverable deployment process, and a maintainable hosting setup.
- Support increased concurrent use through measured capacity planning and scalable services.

## 5. Non-goals for v1

- Rebuilding Supabase Studio or providing a general-purpose database console.
- Automatically emailing or sending push messages until delivery providers and consent requirements are selected.
- Vehicle telematics, live GPS tracking, fuel-card integrations, or automated maintenance purchasing.
- Offline writes that silently overwrite newer server data. Offline read access and queued actions may be added only with clear sync/conflict handling.
- Treating Docker alone as a traffic-scaling or high-availability solution.

## 6. Users and roles

The authorization model has two scopes: platform-wide access and fleet-scoped access. A user's role must be checked on every protected server operation. Hiding a screen or button in the client is not authorization.

| Role | Scope | Expected access |
|---|---|---|
| Super Admin | Platform | Manage platform configuration and support cases; inspect tenant metadata. Cross-fleet content access is exceptional, justified, time-bound, and audited. Cannot silently impersonate a fleet user. |
| Fleet Admin | One fleet | Manage fleet settings, invite/create members, assign fleet roles, and manage all fleet vehicles, alerts, and reports. Cannot grant Super Admin. |
| Fleet Manager | One fleet | Manage vehicles and operational records; view team and reports. Cannot change fleet ownership or assign admin roles unless explicitly granted. |
| Fleet Member | One fleet | View fleet vehicles and reports; perform only actions granted by fleet policy (for example, add or update vehicles). |
| Read-only Member | One fleet | View permitted fleet records, notifications, and reports; cannot create, edit, delete, or administer. |

Role names and the exact Fleet Manager/Fleet Member permissions must be confirmed before development. The current app's `admin` and `member` roles should map to the agreed model without elevating anyone's privileges during migration.

### Authorization rules

- Every fleet-owned row has a non-null `fleet_id` and is accessed only in the authenticated user's authorized fleet scope.
- User identity and role claims must be issued or verified by a trusted identity service and backend; clients cannot choose their own role or fleet scope.
- RLS is defense in depth for database access. The API also enforces authorization and validates ownership on every read and write.
- Cross-fleet access is denied by default, including guessed IDs, exports, search, notifications, and background jobs.
- Super Admin access is separated from fleet roles, protected by MFA, limited to necessary operations, and recorded in an immutable audit trail.
- Role changes, member removal, exports, and support access are audited with actor, target, time, and action.
- Prevent deletion or demotion of the last Fleet Admin, or require a replacement admin first.

## 7. Functional requirements

### 7.1 Accounts and onboarding

- Users can sign in, sign out, and reset passwords securely.
- A new fleet is created through an approved onboarding flow; the first account becomes its Fleet Admin.
- Fleet Admins can invite or create members and assign only roles within their authority.
- A member can belong to a fleet according to the product's membership model; membership changes must not orphan records.
- Account lifecycle actions (invite, accept, suspend, remove, reset) have clear confirmation and outcome messages.

### 7.2 Fleet and team management

- Fleet Admins can view members, role, status, and invitation state.
- Authorized admins can change fleet-level roles and revoke access.
- A user with no active fleet membership sees a clear recovery or contact-admin path.
- Fleet naming and core settings are editable only by Fleet Admins.

### 7.3 Vehicle records

- Create, read, update, and delete vehicle records according to role permissions.
- Validate required fields and date values before save.
- Detect duplicate registrations within a fleet, ignoring case and surrounding whitespace.
- Track insurance expiry, road-tax expiry, roadworthy/inspection expiry, next service date, and notes.
- Search and filter by registration, make/model, status, and upcoming/expired dates.
- Confirm destructive actions and report whether the change succeeded.

### 7.4 Dashboard and reports

- Show vehicle totals and counts for due soon, expired, and up-to-date records.
- Let a user open a count to see the matching records.
- Reports support fleet-scoped date/status summaries and exports.
- CSV output must prevent spreadsheet formula injection and must not include data outside the user's authorized scope.
- Empty states explain what is missing and offer the next useful action.

### 7.5 Notifications and reminders

- Create in-app alerts for document expiry and scheduled service dates, with per-user read state and preferences.
- De-duplicate repeated alerts and update or clear them when the source date changes or the item is renewed.
- Alert windows are configurable from the supported values agreed for v1.
- Notification generation is reliable when the client app is closed; use a managed scheduler or a separately deployed worker.
- Email and push delivery remain future integrations until provider, consent, and delivery requirements are decided.

### 7.6 Mobile application

- Flutter app supports Android and iOS form factors, safe-area layouts, keyboard behavior, and accessible touch targets.
- Users can install the app through the chosen distribution channel. Initial distribution may use internal testing; public Play Store/App Store launch is a later release decision.
- Core workflows work on small screens: sign in, dashboard, vehicle list/detail, add/edit vehicle, alerts, team access as authorized, and settings.
- Display loading, empty, offline, permission, and retry states without raw technical output.
- If offline viewing is enabled, show when data was last refreshed. Do not imply that an offline edit is saved to the server.

## 8. Human-readable messages and error handling

The app must translate technical failures into a clear message and a practical next step. Raw SQL, stack traces, access tokens, internal hostnames, and unfiltered server responses must never be shown to end users.

| Situation | Example message |
|---|---|
| Save succeeded | “Vehicle saved.” |
| Invalid field | “Enter a valid registration number.” |
| Duplicate vehicle | “A vehicle with this registration is already in this fleet.” |
| Permission denied | “You don’t have permission to change this vehicle. Ask a fleet admin for access.” |
| Session expired | “Your session has expired. Sign in again to continue.” |
| Network unavailable | “We couldn’t reach the server. Check your connection and try again.” |
| Server unavailable | “The service is temporarily unavailable. Your changes were not saved. Try again shortly.” |
| Partial/unknown result | “We couldn’t confirm whether this change was saved. Refresh the record before retrying.” |
| Empty fleet | “No vehicles yet. Add your first vehicle to start tracking documents and service dates.” |

Messages should state what happened, whether data was saved, and what the user can do next. Errors must be logged with a correlation ID for support, while the UI shows a short support reference where useful. Logs must omit secrets and unnecessary personal data.

## 9. Data and backend requirements

- Neon is the selected managed PostgreSQL target, subject to a connectivity and feature check during architecture design.
- Use normalized tables for fleets, user identities/memberships, vehicles, documents or expiry dates, notifications, preferences, and audit events.
- Define foreign keys, uniqueness constraints, indexes, and deletion/retention rules in reviewed migrations.
- Maintain separate development, staging, and production environments and credentials.
- Never put database credentials or privileged service credentials in the Flutter or web client.
- Use an API between clients and Neon. The API authenticates users, derives tenant context from trusted identity, authorizes requests, validates input, and writes audit events.
- Apply database RLS policies where supported by the chosen connection/runtime model. Set tenant context safely per transaction; do not rely on a client-supplied `fleet_id`.
- Use connection pooling and bounded transactions. Background jobs must be idempotent and safe to retry.
- Use versioned, forward-only database migrations with backups and a documented rollback/recovery plan. Do not use destructive remote resets on production.
- Plan a staged data migration from Supabase, including row counts, ownership mapping, duplicate checks, verification queries, and a tested rollback/restore procedure.

### Identity decision

Neon provides the PostgreSQL database, not the complete Supabase Auth product experience. Before implementation, choose an identity provider or a carefully maintained application authentication service. Define how users, sessions, MFA, invitations, password recovery, and JWT claims map to fleet memberships. Do not treat client-supplied identity or role values as trusted.

## 10. Hosting and Docker

- Docker images package the API and scheduled worker so deployments are repeatable across development, staging, and production.
- The Flutter application is built and distributed separately; Docker does not host an installed mobile app.
- Select a hosting provider for the API, worker, web/PWA (if retained), and observability. Provider selection is an open decision.
- Scale for concurrency through stateless API instances, measured horizontal scaling, connection pooling to Neon, rate limits, bounded work queues, and load testing.
- Docker by itself does not distribute requests, add database connections, provide high availability, or guarantee that the service can handle many simultaneous users.
- Keep secrets in the host's secret manager/environment configuration. Use health checks, structured logs, metrics, alerting, and deployment rollback.
- Define backup, restore, incident response, and maintenance windows before production launch.

## 11. Security, privacy, and audit

- Enforce least privilege in client, API, and database layers.
- Require MFA for Super Admin accounts; assess MFA for Fleet Admin accounts before launch.
- Apply secure session expiry/revocation, input validation, rate limits on authentication and invitations, and protection against IDOR and cross-tenant leakage.
- Record administrative and sensitive data actions in an audit log.
- Minimize personal data, define retention and deletion rules, and document export access.
- No production secrets in source control, client bundles, logs, or support screenshots.
- Conduct a security review and tenant-isolation test plan before any public launch.

## 12. Non-functional requirements

- **Reliability:** users can tell whether an operation completed; retryable operations are idempotent where possible.
- **Performance:** agree measurable targets after establishing a baseline; initial target proposal is p95 API read under 500 ms for typical fleet queries under expected load.
- **Scale:** establish expected active fleets, users per fleet, peak concurrent requests, and data growth before choosing instance sizes.
- **Accessibility:** readable contrast, scalable text, screen-reader labels, keyboard support where relevant, and touch targets suitable for mobile.
- **Localization:** v1 language is English; keep message strings centralized so additional languages can be added later.
- **Observability:** monitor API latency/error rates, database pool use, job failures, and notification generation; alert on sustained failures.
- **Compatibility:** specify minimum supported Android/iOS versions and device matrix before Flutter implementation.

## 13. Success measures

- A new fleet admin can create a fleet and add a vehicle without assistance.
- A permitted member can complete their main task on a phone without desktop access.
- Unauthorized cross-fleet reads and writes are denied in automated security checks.
- A user can understand common success and failure states without seeing technical jargon.
- Expiry and service alerts are generated once per user/source/state and recover safely after job retries.
- Vehicle, member, notification, and role data migrate with reconciled row counts and no unexplained ownership gaps.
- API performance and error-rate targets are met under an agreed concurrent-user test profile.

## 14. Delivery phases

### Phase 0 — Product and architecture decisions

- Confirm the role matrix, membership model, Super Admin boundaries, and identity provider.
- Inventory existing data, integrations, and current Supabase behavior.
- Define expected scale, hosting provider, support model, and compliance needs.
- Approve the target schema and data migration plan.

### Phase 1 — Backend foundation

- Create repository migration workflow and isolated development/staging environments.
- Implement authentication integration, fleet membership, API authorization, RLS, and audit logging.
- Migrate a sanitized or copied test dataset and verify tenant boundaries.
- Package API and worker with Docker and deploy to staging.

### Phase 2 — Flutter MVP

- Implement authentication, dashboard, vehicles, vehicle details/editing, notifications, and settings.
- Add human-readable message mapping, offline/read-only state handling, and accessibility support.
- Add team management according to finalized roles.

### Phase 3 — Reports and production readiness

- Implement reports and safe exports.
- Add load, security, recovery, and store/internal distribution checks.
- Run production data migration with backup, reconciliation, and rollback readiness.

### Phase 4 — Launch and growth

- Roll out to a small fleet cohort and monitor support cases and service metrics.
- Decide whether to keep the React PWA, publish mobile apps publicly, or support both.
- Add push/email notifications and integrations only after provider and consent decisions.

## 15. Acceptance criteria for v1

1. A user signs in and receives only the fleet memberships and permissions assigned to them.
2. Fleet Admin can manage fleet members and vehicle records within their fleet; ordinary members cannot grant themselves privileges.
3. Super Admin permissions are distinct from fleet roles, MFA-protected, and audited.
4. Requests for another fleet's records fail even when the caller guesses record IDs or modifies client parameters.
5. Vehicle documents and service dates drive correct dashboard statuses and de-duplicated alerts.
6. The Flutter app supports the agreed Android/iOS versions and all v1 core flows on phone-sized screens.
7. User-facing success, validation, permission, connectivity, and server messages are plain language and do not expose technical internals.
8. Production migration can be verified and restored using documented procedures.
9. Dockerized backend services pass health checks and the service meets approved load and latency targets in staging.

## 16. Open decisions

- Which identity provider will replace or complement Supabase Auth?
- Is the web/PWA retained after Flutter launch, and does v1 require desktop web parity?
- What exact actions can Fleet Manager and Fleet Member roles perform?
- Is Super Admin operated by the product owner only, and what support access is required?
- Which hosting provider will run Dockerized API and worker services?
- What are expected fleet count, users per fleet, peak concurrency, and data retention period?
- Which mobile distribution path is first: internal testing, direct Android distribution, Google Play, Apple TestFlight, or public stores?
- Which push/email provider and delivery channels are required for v1 or a later phase?
- What support contact and escalation process should appear in user-facing errors?

## 17. Assumptions

- “App” means a Flutter mobile app for Android and iOS, with the current React PWA retained during transition unless a later decision says otherwise.
- Neon is the preferred managed PostgreSQL host; authentication and API hosting still need explicit selections.
- Docker is intended for backend/API and worker deployment, not the mobile client or database itself.
- Existing fleet records and role assignments should be preserved unless the owner approves a data cleanup or policy change.
- English is the first supported language, but message design should allow localization.
<!--  -->