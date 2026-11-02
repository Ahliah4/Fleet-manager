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
- Neon WebSocket transport for the API pool and migration runner.
- Dockerfile for deployments that connect to Neon.

Not included in this phase: fuel tracking, dispatch, odometer/mileage, GPS, customer or
booking records, attachments, notifications, settlement calculations, a web UI,
client synchronization, production identity-provider setup, and data migration from
IndexedDB or SQLite.

## Requirements

- Node.js 22 or newer (Docker uses Node 24).
- A Neon PostgreSQL project. The API pool and the migration runner use
  `@neondatabase/serverless` over secure WebSockets (`wss://`, port 443), so a
  plain PostgreSQL server reachable only over TCP is not supported by this
  transport.
- Do not use the production branch for development or migration testing.
- Docker is optional. It was not available in the environment where this foundation
  was prepared, so the image build has not been executed here.

## Quick start

### 1. Configure the development branch

```sh
cd backend
npm install
test -f .env || cp .env.example .env
```

Fill `backend/.env` with the development branch values. Never overwrite an existing
`.env`; keep both connection strings in that file only:

```dotenv
NODE_ENV=development
# Non-owner API role, preferably the Neon pooled host.
DATABASE_URL=postgresql://app_rw:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<database>?sslmode=require
DATABASE_EXPECTED_ROLE=app_rw
# Migration-only owner/direct host for the development branch.
MIGRATION_DATABASE_URL=postgresql://<owner>:<password>@<endpoint>.<region>.aws.neon.tech/<database>?sslmode=require
AUTH_ISSUER=
AUTH_AUDIENCE=
AUTH_JWKS_URL=
```

Neither URL opens a TCP connection. The serverless driver uses the host and
database from the URL, then opens `wss://<host>/v2` on port 443. No extra
environment variable is needed for the WebSocket transport.

### 2. Check and apply migrations

```sh
npm run migrate -- --status
npm run migrate:apply -- --confirm-target=<printed host>:<port>/<database>
```

`npm run migrate` only prints status and never changes the schema. It is safe to
run against a branch that has no migration ledger yet. `npm run migrate:apply`
requires `--confirm-target` to match the connected host and database exactly.

### 3. Run the API

```sh
npm run dev
```

The API starts even when auth is unconfigured so liveness can be checked, but
`/readyz` and all `/v1` routes fail closed until `AUTH_*` is set.

### Local Compose stack

`compose.yaml` provides only a plain local PostgreSQL service for manual SQL
experiments. The API and migration runner need a Neon endpoint and remain separate
Node commands.

Set `LOCAL_POSTGRES_PASSWORD` in your local shell before starting the Compose database.
The Compose file has no password default and does not start migrations automatically.

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
| `DATABASE_URL` | API connection using the non-owner `app_rw` role. Prefer the Neon pooled host. |
| `DATABASE_POOL_MAX` | Pool size, 1-50. Default 10. |
| `DATABASE_EXPECTED_ROLE` | Role the API must connect as. Default and supported value: `app_rw`; the migrations grant to this role. Startup fails if it does not match or the role is a superuser or has `BYPASSRLS`, `CREATEDB`, `CREATEROLE`, or `INHERIT`. |
| `MIGRATION_DATABASE_URL` | Migration-only owner/direct connection. Use a separate Neon development branch. Never used by the API server. |
| `AUTH_ISSUER` | Expected JWT issuer. |
| `AUTH_AUDIENCE` | Expected JWT audience. |
| `AUTH_JWKS_URL` | JWKS endpoint for the identity provider. |
| `AUTH_CLOCK_TOLERANCE_SECONDS` | Allowed clock skew, 0-120. Default 30. |
| `TRUST_PROXY` | Optional Fastify trust-proxy setting for a known reverse proxy. |

Both database URLs must point at Neon endpoints. The driver reads the host, database,
user, and password from the URL, then connects over `wss://` on port 443; the
Postgres port in the URL is not used for this transport, so outbound port 5432 does not
need to be open. `sslmode=require` is accepted but TLS is provided by the secure
WebSocket itself. `DATABASE_SSL` is no longer read. Keep the real URLs in
`backend/.env` only and never log them.

`MIGRATION_DATABASE_URL` must be the **direct (unpooled)** development endpoint.
Session-level advisory locks and `SET` statements need a real session; a PgBouncer
transaction-pooled URL can route statements to different backends. `DATABASE_URL` may
use the pooled endpoint because the API sets tenant and role context inside each
transaction.

Never commit `.env` or a real connection string. `.env.example` contains placeholders
only.

## Authentication and authorization

### Neon Managed Better Auth (development)

The Flutter client uses the Neon Managed Better Auth REST API on the **development**
branch for email/password sign-in, account creation, session restore, and password
recovery. Neon issues a short-lived EdDSA JWT through its supported `/auth/token`
endpoint. The client retains only the opaque session cookie in platform secure
storage; it requests a fresh JWT when needed. Fastify verifies the JWT signature
against the branch JWKS endpoint and checks issuer, audience, expiry, and `sub`.
The API then resolves `sub` through `users.idp_subject` and reads the active
membership from the application schema. Neon Auth identity alone grants no fleet
access. Public signup never assigns fleet roles or platform administrator status.

Set the backend's `AUTH_ISSUER`, `AUTH_AUDIENCE`, and `AUTH_JWKS_URL` from the
development branch's Managed Better Auth configuration. Neon documents the JWT
issuer and audience as the auth service origin, and the JWKS URL as the auth base
URL plus `/.well-known/jwks.json`. Keep these values in the server environment;
do not place database URLs or server configuration in the Flutter build. The
mobile build receives only `NEON_AUTH_URL` and `FLEET_API_URL` via Dart defines.

In Neon Console, select only the `development` branch, enable email/password
sign-up and verification codes, configure email delivery, and confirm the
Managed Better Auth JWT and Email OTP endpoints are available. Do not change
production settings. The database must already
contain an application `users` row with the exact Neon Auth subject in
`idp_subject`, provisioned through the authorized fleet owner/admin workflow,
before API access is granted.

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
migrated by accident. Use the branch's direct (unpooled) endpoint: transaction-pooled
connections cannot preserve a session-level advisory lock.

Both the runner and the API use `@neondatabase/serverless` over a secure WebSocket:

- The runner opens one long-lived WebSocket `Client`. That session is what makes
  `pg_advisory_lock`, `BEGIN`/`COMMIT`, and per-migration checksums safe. It never uses
  Neon's one-shot HTTP SQL function for migrations.
- Session settings (`statement_timeout`, `Time Zone`) are applied with `SET` after
  connecting, because the WebSocket proxy does not take node-postgres's `options`
  startup parameter.
- `--status` is read-only. It checks whether `schema_migrations` exists and reports
  every migration as pending if the ledger has not been created; only `--apply`
  creates the ledger and runs migration SQL.
- Errors are printed without the connection URL or password. The target line shows
  only host, port, and database so an operator can confirm it before `--apply`.

If the handshake fails with `ETIMEDOUT`, the network is likely blocking the Neon
endpoint (IP allowlist, egress firewall, or a proxy that does not forward WebSocket
upgrades). A working `https://<endpoint>/v2` response does not by itself prove that
WebSocket upgrades are allowed.

## Safe Neon development path

Do not connect this repository to the Neon `production` branch. Use a separate
development branch.

1. In the Neon console or with an authenticated Neon CLI, select the IP Motors project
   and create or select a dedicated **development** branch. Confirm the branch before
   copying any connection string.
2. Put the development branch's owner/direct connection string in
   `MIGRATION_DATABASE_URL` in a local, ignored `backend/.env`. Keep
   `sslmode=require`; the transport itself is `wss://` on port 443.
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

If WebSocket egress is unavailable, leave the migrations unrun and fix the network
path first. Do not fall back to a direct TCP client or Neon's HTTP SQL interface for
migrations.

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
append-only audit behavior, and platform cross-fleet reads. That history predates
the WebSocket transport and used a plain TCP client.

The WebSocket transport has been exercised against the Neon development branch with
`npm run migrate -- --status`: the connection, advisory lock, ledger probe, and
checksum comparison all run over `wss://`. The three migrations were then applied
through the same WebSocket migration runner. The ledger checksums match the migration
files, and catalog checks confirm `app_rw` is `NOLOGIN`, `NOINHERIT`, `NOSUPERUSER`,
`NOCREATEDB`, `NOCREATEROLE`, `NOREPLICATION`, and `NOBYPASSRLS`; it owns no tables,
has no `DELETE` or `schema_migrations` access, and every migrated table has forced RLS.
No login or password was configured for `app_rw` by this work.

Docker was not installed in the preparation environment, so the image build has not
been executed here.


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
