# IP Motors Fleet Manager API (Phase 1 foundation)

This directory contains the shared backend foundation for the IP Motors fleet app. It
is a TypeScript + Fastify API designed for Neon PostgreSQL and packaged with Docker.
The React PWA and Flutter client are **not** connected to it yet, and nothing here has
been deployed.

This is a foundation, not a production-readiness claim. Identity-provider selection,
initial fleet onboarding, invitations, client sync, and local-data migration remain
open work.

## What is included

- Fastify API with `/healthz` (liveness) and `/readyz` (database, schema, and auth
  readiness).
- Request IDs, validated JSON input, bounded list queries, and a human-readable error
  envelope with a support reference.
- Provider-neutral JWT/JWKS authentication. It verifies issuer, audience, expiry, and
  an asymmetric signature. There is no password storage, session store, MFA
  implementation, or custom identity provider.
- Auth fails closed: with no `AUTH_*` configuration, protected routes return `503`.
  Partial configuration stops startup. There is no environment-variable auth bypass.
- Server-side resolution of the user, single active fleet membership, role, and
  permissions. A client-supplied fleet ID or role is rejected.
- PostgreSQL tables for fleets, users, memberships, platform administrators, vehicles,
  drivers, hires, expenses, income, remittances, and append-only audit events.
- Row-level security with `FORCE ROW LEVEL SECURITY`, per-transaction tenant context,
  and a least-privilege `app_rw` database role.
- Versioned, checksummed migrations and a guarded migration runner.
- Dockerfile and a local Compose stack for PostgreSQL, migrations, and the API.

Not included in this phase: fuel tracking, dispatch, odometer/mileage, GPS, customer or
booking records, attachments, notifications, settlement calculations, a web UI,
client synchronization, production identity-provider setup, and data migration from
IndexedDB or SQLite.

## Requirements

- Node.js 22 or newer (Docker uses Node 24).
- PostgreSQL 15 or newer (local smoke testing used PostgreSQL 18; Compose uses 17).
- Neon PostgreSQL for shared environments. Do not use the production branch for
  development or migration testing.
- Docker is optional. It was not available in the environment where this foundation
  was prepared, so the image build has not been executed here.

## Quick start

### Option A: local PostgreSQL without Docker

```sh
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` with local values. For example:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://app_rw:local_password@127.0.0.1:5432/fleet_dev
DATABASE_SSL=false
DATABASE_EXPECTED_ROLE=app_rw
MIGRATION_DATABASE_URL=postgresql://your_owner@127.0.0.1:5432/fleet_dev
AUTH_ISSUER=
AUTH_AUDIENCE=
AUTH_JWKS_URL=
```

Create the database and a login-capable `app_rw` role before running migrations. The
migration creates `app_rw` as `NOLOGIN` if it does not exist, so an operator must grant
login for the API connection:

```sql
CREATE ROLE app_rw LOGIN NOINHERIT PASSWORD '<local password>';
```

Then:

```sh
npm run migrate -- --status
npm run migrate:apply -- --confirm-target=127.0.0.1:5432/fleet_dev
npm run dev
```

`npm run migrate` only prints status. `npm run migrate:apply` requires
`--confirm-target` to match the connected host and database exactly.

The API starts even when auth is unconfigured so liveness can be checked, but
`/readyz` and all `/v1` routes fail closed until `AUTH_*` is set.

### Option B: local Compose stack

```sh
cd backend
docker compose up --build
```

Compose starts PostgreSQL, applies migrations in a one-shot service, then starts the
API. The credentials in `compose.yaml` and `scripts/init-local-db.sql` are local-only
and must never be reused for Neon or a shared environment.

Set `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` in the shell before starting
Compose to enable protected routes.

```sh
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/readyz
```

### Docker image

```sh
docker build -t ip-motors-fleet-api .
docker run --env-file .env -p 3000:3000 ip-motors-fleet-api
```

The image runs as the non-root `node` user and uses `/healthz` for its container
health check. Migrations are not applied automatically by the image; run the migration
command separately with the owner connection:

```sh
docker run --rm --env-file .env ip-motors-fleet-api \
  node dist/scripts/migrate.js --apply --confirm-target=<host>:<port>/<database>
```

## Environment

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production`. |
| `HOST`, `PORT` | Listen address and port. Defaults: `0.0.0.0`, `3000`. |
| `LOG_LEVEL` | Pino level. Default `info`. |
| `DATABASE_URL` | API connection using the non-owner `app_rw` role. Prefer the Neon pooled URL. |
| `DATABASE_SSL` | `true` for Neon, `false` for a local non-TLS PostgreSQL. |
| `DATABASE_POOL_MAX` | Pool size, 1-50. Default 10. |
| `DATABASE_EXPECTED_ROLE` | Role the API must connect as. Default and supported value: `app_rw`; the migrations grant to this role. Startup fails if it does not match or the role is a superuser or has `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, or `INHERIT`. |
| `MIGRATION_DATABASE_URL` | Migration-only owner/direct connection. Use a separate Neon development branch. Never used by the API server. |
| `AUTH_ISSUER` | Expected JWT issuer. |
| `AUTH_AUDIENCE` | Expected JWT audience. |
| `AUTH_JWKS_URL` | JWKS endpoint for the identity provider. |
| `AUTH_CLOCK_TOLERANCE_SECONDS` | Allowed clock skew, 0-120. Default 30. |
| `TRUST_PROXY` | Optional Fastify trust-proxy setting for a known reverse proxy. |

Never commit `.env` or a real connection string. `.env.example` contains placeholders
only.

## Authentication and authorization

- Only `Authorization: Bearer <JWT>` is accepted.
- The verifier accepts asymmetric algorithms (`RS256/384/512`, `PS256/384/512`,
  `ES256/384`, `EdDSA`) and validates issuer, audience, expiry, and signature
  through the configured JWKS.
- A valid token is only an identity assertion. The API then looks up `users.idp_subject`
  and resolves the active fleet membership server-side.
- A token for an unprovisioned or inactive user returns `403 ACCOUNT_NOT_PROVISIONED`.
- No active membership returns `403 NO_ACTIVE_FLEET` with a recovery message.
- More than one active membership returns `500 MEMBERSHIP_CONFLICT`; the API never
  silently picks one.
- Fleet status must be `active` for fleet routes.
- Platform administrators are resolved from `platform_admins`, separate from fleet
  roles. Phase 1 platform routes are read-only and write audit events. Cross-fleet
  reads are limited to the fleet directory and vehicles.

### Fleet roles

| Role | Intent |
|---|---|
| `fleet_owner` | Full fleet, operations, membership/security, audit, and finance access. |
| `fleet_admin` | Fleet settings, membership/security, audit, vehicles, drivers, and hires. No finance by default. |
| `fleet_manager` | Vehicles (including delete/restore), drivers, and hires. No membership/security or finance by default. |
| `finance_manager` | Expenses, income, and remittances, plus minimal vehicle/driver context. No fleet roles or operations. |
| `fleet_member` | View vehicles and add/edit vehicles when the fleet `member_can_write` policy is on. No delete, restore, drivers, hires, or finance. |
| `read_only` | View fleet profile and vehicles only. |

Fleet Member vehicle writes require both the role permission and the fleet policy.
Deleting or restoring a vehicle requires an owner, administrator, or manager role.
Finance records are posted or voided; they are never edited or hard-deleted.

## API surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/healthz` | Liveness only. |
| `GET` | `/readyz` | Database, schema, and auth readiness. `503` until all are ready. |
| `GET` | `/v1/me` | Resolved user, membership, role, permissions, and fleet policy. |
| `GET`, `POST` | `/v1/vehicles` | List (search/paging) and create. |
| `GET`, `PATCH`, `DELETE` | `/v1/vehicles/:vehicleId` | Read, update, soft delete. |
| `POST` | `/v1/vehicles/:vehicleId/restore` | Restore a removed vehicle. |
| `GET`, `POST` | `/v1/drivers` | List and create. |
| `GET`, `PATCH` | `/v1/drivers/:driverId` | Read and update/deactivate. Hard delete is not exposed. |
| `GET`, `POST` | `/v1/hires` | List and create. |
| `GET`, `PATCH` | `/v1/hires/:hireId` | Read and update. Hard delete is not exposed. |
| `GET`, `POST` | `/v1/expenses` | List and create. |
| `GET` | `/v1/expenses/:recordId` | Read. |
| `POST` | `/v1/expenses/:recordId/void` | Void with a reason. |
| `GET`, `POST` | `/v1/income` | List and create. |
| `GET` | `/v1/income/:recordId` | Read. |
| `POST` | `/v1/income/:recordId/void` | Void with a reason. |
| `GET`, `POST` | `/v1/remittances` | List and create. |
| `GET` | `/v1/remittances/:recordId` | Read. |
| `POST` | `/v1/remittances/:recordId/void` | Void with a reason. |
| `GET` | `/v1/platform/fleets` | Platform directory; paginated and audited. |
| `GET` | `/v1/platform/fleets/:fleetId/vehicles` | Cross-fleet vehicle read; audited. |

List endpoints use `limit` (1-100, default 50) and `offset` (0-10000). They never
return an unbounded result set. Finance lists also accept `from`, `to`, `vehicleId`,
`driverId`, `status`, and `search`.

Amounts are stored as `numeric(14,2)` and returned as decimal strings. `ZMW` is the
default display currency, but every financial record stores its own ISO 4217 currency.
Dates use `YYYY-MM-DD`; timestamps are ISO 8601. Hire duration and remittance period
ordering are checked in both the API and the database.

## Tenant isolation and audit

- Every tenant table has RLS enabled and forced.
- Each request runs in a transaction. The API sets `app.user_id`, `app.fleet_id`,
  `app.role`, and `app.permissions` with `set_config(..., true)`.
- Missing or blank context is treated as no access.
- The API's `app_rw` role has no `DELETE` grant on tenant tables, no DDL rights, and
  insert-only access to `audit_events`.
- The API refuses to start if its database role does not match
  `DATABASE_EXPECTED_ROLE`, or if that role is a superuser or has `BYPASSRLS`,
  `CREATEDB`, `CREATEROLE`, or `INHERIT`.
- Audit events are append-only at the grant and trigger level. Vehicle, driver, hire,
  finance create/void, and platform read actions write audit rows in the same
  transaction as the change.
- Vehicle deletes are soft deletes. Financial records move from `posted` to `voided`
  with a reason and actor; the original financial values are immutable.
- Finance context can still resolve the registration of a soft-deleted vehicle on
  historical financial rows; vehicle list/read endpoints continue to hide deleted
  vehicles.
- RLS depends on `app_rw` being used only by this API. The `app.*` context is set by
  the API inside each transaction, and a holder of the `app_rw` credential could set
  it directly. Treat `app_rw` as a trusted service secret: never expose it to a
  client, a reporting tool, or an untrusted job. Secret rotation and stronger
  per-tenant database roles are future security work.

## Migrations

Migrations live in `migrations/` and are applied in filename order. The runner stores
version, checksum, application time, and duration in `schema_migrations` and refuses to
run if an already-applied file changed.

```sh
npm run migrate -- --status
npm run migrate:apply -- --confirm-target=<host>:<port>/<database>
```

The runner reads only `MIGRATION_DATABASE_URL`. It never uses the API's `DATABASE_URL`.
`--apply` requires an exact `--confirm-target` match so a wrong database is not
migrated by accident.

## Safe Neon development path

Do not connect this repository to the Neon `production` branch. Use a separate
development branch.

1. In the Neon console or with an authenticated Neon CLI, select the IP Motors project
   and create or select a dedicated **development** branch. Confirm the branch before
   copying any connection string.
2. Put the development branch's owner/direct connection string in
   `MIGRATION_DATABASE_URL` in a local, ignored `.env`. Set `DATABASE_SSL=true`.
3. Run `npm run migrate -- --status` and confirm the printed target is the development
   branch. Then run
   `npm run migrate:apply -- --confirm-target=<printed host/database>`.
4. The migration creates `app_rw` as `NOLOGIN`. In the Neon console (or a one-off
   owner SQL session), give it a strong password and login capability:
   `ALTER ROLE app_rw WITH LOGIN PASSWORD '<generated secret>';`
5. Put the development branch's **pooled** `app_rw` connection string in
   `DATABASE_URL`. Keep `DATABASE_EXPECTED_ROLE=app_rw`. Do not put the owner URL in
   `DATABASE_URL`.
6. Configure `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` once an identity
   provider is selected. Until then, `/readyz` remains `503` and protected routes fail
   closed.

No migration has been run against Neon from this workspace. If the Neon CLI is not
authenticated or a development branch is not available, leave the migrations unrun
and complete steps 1-3 later.

Initial user/fleet provisioning and invitation delivery are not implemented. Do not
copy IndexedDB or SQLite records into the shared database yet; that migration needs the
unresolved product decisions to be settled first.

## Verification

From `backend/`:

```sh
npm run typecheck
npm test
npm run build
```

The migration SQL and RLS policies were also exercised against a throwaway local
PostgreSQL 18 cluster, including cross-fleet isolation, Fleet Member delete denial,
Finance Manager context access, vehicle soft delete/restore, finance voiding,
append-only audit behavior, and platform cross-fleet reads. No test connected to Neon.

Docker was not installed in the preparation environment, so the image build and Compose
stack have not been executed here.

## Open decisions / next work

- Identity provider selection and provisioning/invitation flow.
- Fleet creation and first-owner onboarding.
- Delegated membership management and owner/admin transfer rules.
- Membership/settings/export/audit-browsing endpoints. The schema and permission
  vocabulary exist, but Phase 1 exposes only the API surface above.
- Whether expense categories become a managed reference table; this phase stores a
  validated category text value matching the current clients.
- Whether hire overlap constraints and driver-licence uniqueness should be enforced.
- Data migration from IndexedDB/SQLite and client sync.
- Production deployment, observability beyond structured logs, rate limiting, and
  secret management.
- Do not claim production readiness or deploy this foundation yet.
