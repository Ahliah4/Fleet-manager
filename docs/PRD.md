# Product Requirements Document

## IP Motors Fleet Manager

**Status:** Draft for review  
**Version:** 0.4  
**Date:** 25 October 2026  
**Product owner:** Najma Mustafa

## 1. Product summary

IP Motors Fleet Manager is an owner-operated car-hire and taxi fleet operations app. It helps the business manage cars (such as Mark X, Fortuner, Mercedes-Benz, Hilux, and Ford Raptor), assigned drivers, maintenance costs, daily income, and driver remittances. The current client is an installable React PWA with on-device IndexedDB storage and no sign-in or cloud sync. A shared hosted backend and Flutter client are future work; Neon remains a database candidate, with identity and hosting decisions still open.

The product must support multiple fleets (tenants) while ensuring every member can only access the data allowed by their role. It must explain successful actions and failures in clear, human-readable language.

## 2. Background and current state

The current PWA supports a vehicle register, driver records, itemized maintenance/expense records, separate income and remittance entries, document dates, search, and JSON backup/restore. Data stays in the current browser profile on the current device. There are no user accounts, team permissions, shared records, server backups, or cross-device sync in this version. Existing cloud setup and authentication were removed from the active app; any old remote records must be exported separately before a future migration.

## 3. Vision and direction

Deliver a dependable car-hire operations product that works well on phones first, remains usable on desktop, and helps owners see which cars and drivers are working, what income is due or received, and which vehicles need attention—without weakening tenant isolation.

### Product direction

1. Make the on-device PWA usable for entering and finding vehicle, driver, maintenance, and finance records.
2. Protect local data with clear backup/restore guidance.
3. Confirm roles, permissions, account ownership, and tenant rules before adding shared access.
4. Select and build a hosted API/database and identity service for multi-user use; Neon remains a candidate.
5. Build a mobile-first Flutter client after the shared data contracts and security model are approved.
6. Migrate records only through a reviewed import, reconciliation, and recovery plan.

The React PWA may remain available during the transition. It should not be retired until the Flutter app has passed acceptance checks and users have a safe migration path.

## 4. Goals

- Make the core fleet workflows fast and clear on Android and iOS.
- Support basic vehicle/driver assignment, daily income recording, and driver remittance records.
- Track maintenance and other vehicle requirement costs by vehicle and across the fleet.
- Preserve vehicle, team, notification, and reporting capabilities that are still needed.
- Enforce role-based access in the API and database, including tenant isolation through RLS.
- Introduce a platform-level Super Admin role with tightly controlled support access.
- Make success, validation, permission, connectivity, and server errors understandable to non-technical users.
- Establish version-controlled database migrations, a recoverable deployment process, and a maintainable hosting setup.
- Support increased concurrent use through measured capacity planning and scalable services.

## 5. Non-goals for v1

- Building a general-purpose database console.
- Automatically emailing or sending push messages until delivery providers and consent requirements are selected.
- Detailed dispatch, mileage/odometer, fuel tracking, live GPS/telematics, passenger marketplaces, and automated maintenance purchasing are outside v1.
- Offline writes that silently overwrite newer server data. Offline read access and queued actions may be added only with clear sync/conflict handling.
- Treating Docker alone as a traffic-scaling or high-availability solution.

## 6. Users and roles

The authorization model has three scopes: platform-wide support access, fleet-wide access, and module-specific access. The Fleet Owner has full access to their business fleet. A Finance Manager works in the financial area without gaining fleet-administration powers. A developer uses a separate platform Super Admin account to view data across fleets; that access is authenticated, auditable, and visible in the audit history. A user's role and permissions must be checked on every protected server operation. Hiding a screen or button in the client is not authorization.

| Role | Scope | Expected access |
|---|---|---|
| Super Admin (developer) | Platform | View fleet and financial data across fleets for development/support. Access uses a separate account with MFA and is audited; it cannot be a hidden or shared backdoor. Any write/support actions are separately permissioned and audited. |
| Fleet Owner | One fleet | Full access to the owner's fleet: vehicles, drivers, hires, expenses, income, settlements, reports, roles, and settings. May grant fleet roles but cannot grant Super Admin. |
| Fleet Admin | One fleet | Manage fleet operations and members within permissions granted by the Fleet Owner. Cannot grant Super Admin or take fleet ownership. |
| Fleet Manager | One fleet | Manage vehicles, drivers, assignments, and maintenance. Financial access is limited to the permissions assigned by the Fleet Owner. Cannot change fleet ownership or grant platform roles. |
| Finance Manager | One fleet / finance module | View and manage earnings, remittances/settlements, vehicle expenses, receipts, and financial reports. May view the minimum vehicle/driver details needed to associate records. Cannot manage roles, fleet security, or vehicle ownership. |
| Fleet Member | One fleet | View fleet vehicles and reports; perform only actions granted by fleet policy (for example, add or update vehicles). |
| Read-only Member | One fleet | View permitted fleet records, notifications, and reports; cannot create, edit, delete, or administer. |
| Driver record (not an app role in v1) | Fleet-scoped profile | The owner or an authorized manager maintains driver details and records driver assignments/activity. Drivers do not sign in to the app in v1. A separate driver login can be considered later. |

The Fleet Owner and Finance Manager are the initial business roles requested by the owner. The exact Fleet Manager/Fleet Member capabilities and legacy role mapping must be confirmed before development. The current app's `admin` and `member` roles should map without elevating anyone's privileges during migration. Future roles (for example, a staff member responsible for cards or vehicle handovers) should be added through the permission catalog rather than by scattering role-name checks through the client.

### Authorization rules

- Every fleet-owned row has a non-null `fleet_id` and is accessed only in the authenticated user's authorized fleet scope.
- User identity and role claims must be issued or verified by a trusted identity service and backend; clients cannot choose their own role or fleet scope.
- RLS is defense in depth for database access. The API also enforces authorization and validates ownership on every read and write.
- Cross-fleet access is denied by default, including guessed IDs, exports, search, notifications, and background jobs.
- Super Admin access is separated from fleet roles, protected by MFA, limited to necessary operations, and recorded in an immutable audit trail.
- Role changes, member removal, exports, and support access are audited with actor, target, time, and action.
- Prevent deletion or demotion of the last Fleet Admin, or require a replacement admin first.
- Enforce financial permissions at the API and database layers. Finance access must not implicitly grant access to team administration or security settings.
- Keep platform Super Admin separate from fleet roles. Super Admin data views and actions are logged with actor, fleet, purpose, and time.

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
- The Fleet Owner can assign the Finance Manager role and other available roles; each role grants only its defined modules/actions.
- Permission checks use a centralized, extensible permission catalog (for example, `finance.expenses.read`, `finance.expenses.manage`, `fleet.vehicles.edit`). New modules can register permissions without rewriting unrelated authorization logic. The backend defaults to deny when a permission is absent.

### 7.3 Vehicle records

- Create, read, update, and delete vehicle records according to role permissions.
- Validate required fields and date values before save.
- Detect duplicate registrations within a fleet, ignoring case and surrounding whitespace.
- Track insurance expiry, road-tax expiry, roadworthy/inspection expiry, next service date, and notes.
- Search and filter by registration, make/model, status, and upcoming/expired dates.
- Confirm destructive actions and report whether the change succeeded.

### 7.4 Drivers and vehicle assignments

- Maintain driver profiles and active/inactive status, with only the personal and licence information the business needs.
- Assign a vehicle to a driver and preserve the current assignment.
- Show which vehicles are available, assigned, under maintenance, or unavailable.
- Driver profiles and activity are entered by the owner or authorized manager; drivers have no app accounts in v1.
- Record who created or changed an assignment and when.

### 7.5 Vehicle expenses

- Track vehicle-related expenses separately from income, including maintenance, replacement parts, consumables, and other car requirements (for example, batteries and engine oil).
- Each expense records the vehicle, date, category, description/item, amount and currency, supplier/payee when known, payment method when known, and optional receipt/invoice image.
- Detect likely duplicate expense entries and request confirmation before saving them.

### 7.6 Maintenance history and expenditure

- Maintain a dated maintenance history for each vehicle, including work performed, parts/materials purchased, service provider or supplier, notes, and itemized costs.
- Let the owner or authorized manager record common requirements such as batteries, engine oil, tyres, filters, repairs, inspections, and other parts without needing a predefined catalog.
- Show each vehicle's maintenance and operating expenditure for a selectable period and over its lifetime, with itemized entries and subtotals by category.
- Show total expenditure across the fleet for a selectable period, with vehicle and category breakdowns so the owner can see where money went.
- Keep maintenance costs distinct from income and driver remittances; summaries must not silently net these different records together.
- Allow corrections through auditable adjustments; preserve original financial history. Support optional receipt/invoice attachments.

### 7.7 Daily income and driver settlements

- Record daily earnings by vehicle and driver, with date, amount, currency, source/type, and payment method where relevant.
- The owner or an authorized manager enters daily income and driver remittances; a driver login is not required in v1.
- Track cash collected by the business, cash held by a driver, amounts remitted, adjustments, and outstanding balances as separate ledger entries.
- Provide a configurable settlement period. **Proposed starting assumption:** earnings are entered daily and driver remittances are reconciled every 10 days; the owner must confirm whether this is the exact accounting rule.
- Show expected versus received amounts, settlement period totals, overdue remittances, and a per-driver history.
- Require an authorized user and timestamp for corrections; preserve an audit trail rather than overwriting financial history.
- Enforce the Finance Manager's allowed create/read/update actions separately from Fleet Owner and Super Admin privileges.
- Support separate summaries of income, vehicle expenses, and remittances. Clearly label these as operational summaries, not statutory accounting or tax advice.
- Store the currency explicitly on every financial record; ZMW is proposed pending owner confirmation.

### 7.8 Dashboard and reports

- Show vehicle totals and counts for due soon, expired, and up-to-date records.
- Show operational status counts (available, assigned/on hire, maintenance) and concise income/remittance totals for the selected day or settlement period.
- Show maintenance/operating expenditure for the selected period, with fleet total and a clear per-vehicle breakdown.
- Provide direct links from dashboard figures to matching vehicles, drivers, expenses, or settlement records.
- Let a user open a count to see the matching records.
- Reports support fleet-scoped date/status summaries and exports.
- CSV output must prevent spreadsheet formula injection and must not include data outside the user's authorized scope.
- Empty states explain what is missing and offer the next useful action.

### 7.9 Notifications and reminders

- Create in-app alerts for document expiry and scheduled service dates, with per-user read state and preferences.
- De-duplicate repeated alerts and update or clear them when the source date changes or the item is renewed.
- Alert windows are configurable from the supported values agreed for v1.
- Notification generation is reliable when the client app is closed; use a managed scheduler or a separately deployed worker.
- Email and push delivery remain future integrations until provider, consent, and delivery requirements are decided.

### 7.10 Mobile application

- Flutter app supports Android and iOS form factors, safe-area layouts, keyboard behavior, and accessible touch targets.
- Users can install the app through the chosen distribution channel. Initial distribution may use internal testing; public Play Store/App Store launch is a later release decision.
- Core workflows work on small screens: dashboard, vehicle list/detail, add/edit vehicle, driver/vehicle assignment, maintenance/expense entry, vehicle and fleet expenditure summaries, daily earnings, remittance review, backup/restore, and settings.
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

- Current data storage is browser IndexedDB on a single device; it is not a shared or server database.
- Neon is a candidate managed PostgreSQL target for a future shared backend, subject to an architecture and connectivity review.
- Use normalized tables for fleets, user identities/memberships, vehicles, documents or expiry dates, notifications, preferences, and audit events.
- Define foreign keys, uniqueness constraints, indexes, and deletion/retention rules in reviewed migrations.
- Maintain separate development, staging, and production environments and credentials.
- Never put database credentials or privileged service credentials in the Flutter or web client.
- Use an API between clients and Neon. The API authenticates users, derives tenant context from trusted identity, authorizes requests, validates input, and writes audit events.
- Organize the API and client into feature modules (vehicles, drivers, maintenance, finance, reports, team, settings) with versioned contracts. New modules must declare their permissions and data ownership; disabling/removing a UI module must not bypass backend authorization or silently delete its data.
- Apply database RLS policies where supported by the chosen connection/runtime model. Set tenant context safely per transaction; do not rely on a client-supplied `fleet_id`.
- Use connection pooling and bounded transactions. Background jobs must be idempotent and safe to retry.
- Use versioned, forward-only database migrations with backups and a documented rollback/recovery plan. Do not use destructive remote resets on production.
- Plan a staged import from local JSON backups to the future backend, including row counts, ownership mapping, duplicate checks, verification queries, and a tested rollback/restore procedure.

### Identity decision

Before enabling shared accounts, choose an identity provider or a carefully maintained application authentication service. Define how users, sessions, MFA, invitations, password recovery, and trusted role claims map to fleet memberships. Do not treat client-supplied identity or role values as trusted.

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
- Keep developer/Super Admin accounts distinct from business owner accounts. Log cross-fleet reads and privileged changes; never use a hidden service credential in a client application.
- Apply secure session expiry/revocation, input validation, rate limits on authentication and invitations, and protection against IDOR and cross-tenant leakage.
- Record administrative and sensitive data actions in an audit log.
- Minimize personal data, define retention and deletion rules, and document export access.
- No production secrets in source control, client bundles, logs, or support screenshots.
- Conduct a security review and tenant-isolation test plan before any public launch.

## 12. Non-functional requirements

- **Reliability:** users can tell whether an operation completed; retryable operations are idempotent where possible.
- **Performance:** agree measurable targets after establishing a baseline; initial target proposal is p95 API read under 500 ms for typical fleet queries under expected load.
- **Scale:** establish expected active fleets, users per fleet, peak concurrent requests, and data growth before choosing instance sizes.
- **Financial integrity:** money records retain who entered/changed them, when, and why; summaries reconcile to underlying ledger entries.
- **Accessibility:** readable contrast, scalable text, screen-reader labels, keyboard support where relevant, and touch targets suitable for mobile.
- **Localization:** v1 language is English; keep message strings centralized so additional languages can be added later.
- **Observability:** monitor API latency/error rates, database pool use, job failures, and notification generation; alert on sustained failures.
- **Extensibility:** adding a feature module or role should use documented module boundaries and permission definitions; schema changes use additive, versioned migrations. Future features still require implementation and migration work; they are not enabled automatically by configuration alone.
- **Compatibility:** specify minimum supported Android/iOS versions and device matrix before Flutter implementation.

## 13. Success measures

- A new fleet admin can create a fleet and add a vehicle without assistance.
- An authorized manager can assign a driver to a vehicle and see the current assignment.
- An authorized user can enter daily income and record driver remittances while preserving the original entries; settlement timing remains configurable until confirmed.
- Owners can see vehicle availability, maintenance costs by vehicle and across the fleet, and income/remittance entries from the app.
- A permitted member can complete their main task on a phone without desktop access.
- Unauthorized cross-fleet reads and writes are denied in automated security checks.
- A user can understand common success and failure states without seeing technical jargon.
- The Finance Manager can manage financial records and see fleet financial summaries without being able to change fleet roles or security settings.
- Super Admin cross-fleet views and privileged actions appear in the audit log.
- Expiry and service alerts are generated once per user/source/state and recover safely after job retries.
- Vehicle, member, notification, and role data migrate with reconciled row counts and no unexplained ownership gaps.
- API performance and error-rate targets are met under an agreed concurrent-user test profile.

## 14. Delivery phases

### Phase 0 — Product and architecture decisions

- Confirm the role matrix, membership model, Super Admin boundaries, and identity provider.
- Inventory on-device records and exports; confirm the future shared-backend and identity design.
- Define expected scale, hosting provider, support model, and compliance needs.
- Confirm how drivers remit money, settlement timing, currency, maintenance categories, and receipt requirements.
- Approve the target schema and data migration plan.

### Phase 1 — Backend foundation

- Create repository migration workflow and isolated development/staging environments.
- Implement authentication integration, fleet membership, API authorization, RLS, and audit logging.
- Migrate a sanitized or copied test dataset and verify tenant boundaries.
- Package API and worker with Docker and deploy to staging.

### Phase 2 — Flutter MVP

- Implement the selected identity service, dashboard, vehicles, driver records, assignments, itemized maintenance/expenses and fleet expenditure reports, daily income and remittance review, notifications, and settings.
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
6. Authorized staff can record vehicle/driver assignments, maintenance expenses, daily earnings, and remittance entries with a traceable history.
7. The owner can view itemized maintenance spend for one vehicle and total fleet spend for a selected period, with vehicle/category breakdowns.
8. The Flutter app supports the agreed Android/iOS versions and all v1 core flows on phone-sized screens.
9. User-facing success, validation, permission, connectivity, and server messages are plain language and do not expose technical internals.
10. Production migration can be verified and restored using documented procedures.
11. Dockerized backend services pass health checks and the service meets approved load and latency targets in staging.

## 16. Open decisions

- Which identity provider will support future shared accounts?
- Is the web/PWA retained after Flutter launch, and does v1 require desktop web parity?
- What exact actions can Fleet Manager and Fleet Member roles perform?
- Which additional staff roles are needed after Fleet Owner and Finance Manager (for example, a vehicle/card handover clerk), and what exact permissions should each receive?
- Which hosting provider will run Dockerized API and worker services?
- What are expected fleet count, users per fleet, peak concurrency, and data retention period?
- Which mobile distribution path is first: internal testing, direct Android distribution, Google Play, Apple TestFlight, or public stores?
- Which push/email provider and delivery channels are required for v1 or a later phase?
- What support contact and escalation process should appear in user-facing errors?
- Which maintenance/expense categories and receipt requirements should be available by default?
- Are daily amounts entered as gross earnings, a fixed daily vehicle fee, a driver remittance, or a combination?
- Is the 10-day period the required driver remittance/settlement cycle? Are daily payments also accepted?
- Which currency is used (ZMW proposed), and are multiple payment methods/currencies needed?
- Detailed dispatch, fuel, and mileage tracking are excluded from v1; revisit only if the owner requests them.

## 17. Assumptions

- “App” means a Flutter mobile app for Android and iOS, with the current React PWA retained during transition unless a later decision says otherwise.
- The current PWA uses on-device storage. Neon is a candidate future database; identity and API hosting still need explicit selections.
- Docker is intended for backend/API and worker deployment, not the mobile client or database itself.
- Existing fleet records and role assignments should be preserved unless the owner approves a data cleanup or policy change.
- English is the first supported language, but message design should allow localization.
- The business owns a mixed passenger/commercial vehicle fleet and drivers operate vehicles for hire. The owner or authorized manager enters driver activity and financial records in v1; drivers do not need app accounts.
- The Fleet Owner has full access to their own fleet; a Finance Manager is limited to finance operations and related read-only context; the developer uses a separate, auditable platform Super Admin account with cross-fleet visibility.
- Daily income is recorded and a 10-day driver settlement cycle is proposed, but the exact cash-flow meaning and rules must be confirmed before implementing financial calculations.
- Detailed dispatch, fuel, and mileage tracking are not required for v1.
