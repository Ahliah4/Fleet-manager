# Cloudflare Workers migration tracker

**Status:** Planning and compatibility inventory  
**Scope:** Move the shared Fleet Manager API to Cloudflare Workers, retain Neon PostgreSQL, and keep the Flutter app as the mobile client.

## Current compatibility finding

The backend is a Node.js 22+ Fastify service. Its business rules, role permissions, Zod schemas, SQL repositories, and migration SQL are useful and should be preserved where possible. The Fastify app, plugins, request/reply handlers, startup/shutdown code, and current database pool are tied to the Node server runtime.

Cloudflare Workers use a Fetch-based runtime. Cloudflare documents Hyperdrive as the recommended way for Workers to connect to Neon, using a standard PostgreSQL driver. The current API uses `@neondatabase/serverless` over WebSockets, so the Worker database adapter will need to change. The migration runner is a separate Node CLI and must stay off Hyperdrive because it relies on a long-lived session, advisory locks, and interactive transactions.

This is a real runtime migration, not just a deployment configuration change. Do not delete the Docker files or replace the working API until the Worker implementation covers the existing API and security checks.

## Achieved

- [x] Flutter SDK and Android development environment set up; the app has launched in the Android emulator.
- [x] Flutter local-first app built with dashboard, vehicles, drivers, hires, maintenance, finance, reports, and settings screens.
- [x] SQLite local storage, JSON backup/restore, and report CSV export are present.
- [x] Recovered fleet CSV importer is implemented; the reported recovery check parsed all 65 vehicle rows successfully.
- [x] Neon development branch `development` created and identified as `br-flat-pine-b4apj7b4`.
- [x] Three versioned PostgreSQL migrations were applied to that development branch; `app_rw` was checked for least-privilege grants and forced RLS.
- [x] Fastify backend foundation exists for health/readiness, vehicles, drivers, hires, finance, platform reads, JWT verification, memberships, permissions, audit, and RLS transaction context.
- [x] Neon WebSocket transport was added to the Node API and migration runner after direct TCP was blocked by the local network.
- [x] A prior local API readiness response reported database and schema checks as `ok`; authentication was still `not_configured`.
- [x] Existing Dockerfile and Compose setup are available as a fallback during migration. They are not required by Workers and have not been removed.

## Remaining work

### 1. Identity and onboarding

- [ ] Enable Neon Auth on the development branch and verify the current Auth API, token type, issuer, audience, and JWKS details from official Neon configuration.
- [ ] Confirm that Flutter can obtain a credential that the API can securely verify; do not assume the browser cookie flow is a Bearer JWT flow.
- [ ] Implement custom IP Motors sign-in, sign-up/invitation acceptance, session restore, sign-out, verification, and password recovery.
- [ ] Implement safe first Fleet Owner provisioning, invitations, and membership administration. Public sign-up must never grant a privileged role.

### 2. Cloudflare Worker API

- [x] Added an isolated Hono Fetch Worker entry point and typed Cloudflare project config; Fastify remains intact.
- [x] Added health/readiness, request IDs, safe error envelopes, security headers, CORS allow-list support, Neon JWT verification, session/membership lookup, and read-only vehicle listing for the proof slice.
- [x] Added a Hyperdrive `pg` adapter for proof routes; each transaction uses a single client and sets the existing transaction-local RLS context.
- [x] Kept Neon/Auth/runtime settings in Cloudflare build bindings and documented development-only binding setup.
- [ ] Port every remaining route with existing validation, response shapes, authorization, audit writes, and tenant isolation. The Worker must not replace Fastify until this is complete.
- [ ] Configure and exercise a Hyperdrive binding against Neon `development`; current tests use a mocked PostgreSQL client.
- [ ] Keep `backend/scripts/migrate.ts` as a separate Node migration command using the direct development connection; do not run production migrations automatically on Worker startup.

### 3. Client connection and data migration

- [ ] Add a Flutter API client with secure token storage, retry/error handling, and explicit loading/offline states.
- [ ] Replace local-only writes with an agreed sync flow; preserve a safe export/backup path for local SQLite data.
- [ ] Define and test how the recovered 65 vehicle records are imported into the shared development fleet without duplicates or ownership gaps.
- [ ] Define conflict behavior when local and shared data differ before enabling multi-user writes.

### 4. Verification and release

- [ ] Run type checks and tests for the Worker runtime and the existing Node migration runner.
- [ ] Verify all API routes, login/session behavior, role boundaries, cross-fleet denial, audit events, and RLS against a development-only database.
- [ ] Deploy a staging Worker and connect a development Flutter build; keep production branch and live fleet data untouched.
- [ ] Decide whether the Dockerfile/Compose files are still useful for local development or fallback. Remove them only after the Worker path is verified and docs are updated.
- [ ] Complete backup, monitoring, rate-limit, recovery, privacy, and production rollout checks before launch.

## Suggested implementation order

1. Verify Neon Auth's Flutter-to-API token flow on development.
2. Build a Worker proof of compatibility for `/healthz`, `/readyz`, JWT verification, and one read-only fleet request.
3. Add the Hyperdrive database adapter and prove tenant context remains transaction-local.
4. Port the remaining route groups and run the authorization/isolation checks.
5. Connect Flutter, add onboarding and sync, then migrate the local records.
6. Deploy to staging; remove Docker only if it no longer serves local development or fallback needs.

## Important working-tree note

There are substantial pre-existing uncommitted changes across the backend, Flutter app, and documentation. Keep those changes intact while doing this migration; review diffs before edits and avoid broad cleanup or resets.
