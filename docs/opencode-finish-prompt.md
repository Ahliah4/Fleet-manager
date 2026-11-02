# OpenCode prompt: finish Fleet Operations staging and iPhone delivery

Continue the existing Fleet Operations project in
`/home/najma/Projects/Fleet-manager`. Act as the senior engineer responsible for
getting the shared staging app genuinely usable. Do the work; do not return only
an audit or a long plan. Keep going through safe, in-scope implementation and
verification until you either have a working development/staging path or reach
an external blocker that code cannot solve.

## Non-negotiable scope and safety

- This is one Fleet Operations product: Flutter is the mobile client; the
  Fastify/Cloudflare API and Neon PostgreSQL database are the shared backend.
- Work only against the Neon branch named `development`. Never touch Neon
  production, production Cloudflare configuration, or live customer data.
- Preserve all uncommitted UI, local-first, database, auth, and documentation
  work. Inspect `git status` first. Do not reset, discard, mass-format, or
  overwrite unrelated changes.
- Never print, request, log, commit, or echo database URLs, passwords, Cloudflare
  tokens, signing keys, session cookies, refresh tokens, or bearer tokens.
- Do not run another migration or owner bootstrap: migration 0004 and the initial
  Fleet Owner bootstrap have already succeeded on development.
- Never trust client-supplied user IDs, fleet IDs, or roles. Resolve the verified
  JWT subject and active fleet membership on the server. Preserve RLS transaction
  context, permission checks, audit logging, tenant isolation, and fail-closed
  behaviour. Public signup must never grant Fleet Owner, Super Admin, or any fleet
  role.
- Do not revive the disabled direct Flutter-to-Neon cookie flow. The supported
  architecture is system browser + gateway + PKCE S256 + state + single-use code
  + rotating refresh token + short-lived EdDSA access token.
- Read current official Neon, Cloudflare, Flutter, and Apple documentation before
  relying on version-sensitive APIs or deployment commands. Do not guess.

## Verified current state

- Flutter local-first app works and contains 65 recovered vehicles.
- Neon development migrations 0001 through 0004 are applied.
- The initial Neon identity is bootstrapped as the active Fleet Owner.
- Fastify tests: 67 passing; build passes.
- Cloudflare Worker tests: 10 passing; typecheck passes.
- Flutter analysis is clean; 24 tests pass.
- The Next.js auth gateway typechecks and builds. Local `.env.local` is ignored,
  permission-protected, and contains development-only generated keys/settings.
- Flutter already contains `GatewayAuthService`, secure storage, browser PKCE,
  refresh rotation, session restore, sign-out, and `/v1/me` resolution.
- The current auth gateway mobile-flow store uses in-memory maps and deliberately
  fails closed in production. This must not be deployed as a real session store.
- The current Flutter fleet screens still read/write SQLite; multi-phone sync is
  not yet implemented.
- The root React PWA is also browser-local only and is not a substitute for the
  shared app.

## Required implementation order

### 1. Reproduce and finish local end-to-end authentication

- Run the Fastify API with gateway issuer/audience/JWKS settings and the gateway
  on a non-conflicting port.
- Exercise sign-in through the Android system browser, callback, code exchange,
  `/v1/me`, session restore, token refresh, and sign-out.
- Add focused automated tests for any failure found. Do not expose raw provider
  responses or secrets in errors.

### 2. Make the gateway safe for Cloudflare staging

- Replace the in-memory code and refresh-token maps with durable Cloudflare
  storage suitable for atomic rotation. Prefer a Durable Object when atomic
  token-family coordination is required; verify the current official platform
  API first.
- Store only hashes of authorization codes and refresh tokens.
- Add refresh-token family IDs, atomic rotation, reuse detection that revokes the
  whole family, expiry, revocation, cleanup, and safe rate limits.
- Keep authorization codes single-use, PKCE-bound, state-bound, redirect-URI
  allowlisted, and short-lived.
- Move the production storage/configuration check to startup where supported and
  retain fail-closed behaviour.
- Add tests for used/expired codes, wrong verifier/state, refresh rotation,
  replay/reuse detection, revoked families, expiry, cleanup, and concurrent
  exchanges.
- The gateway is currently Next.js. Verify the supported Cloudflare deployment
  path (including vinext/OpenNext compatibility with `@neon/auth`) before
  migrating it. Do not invent unsupported bindings.

### 3. Deploy development-only Cloudflare staging

- Use the repository's Cloudflare configuration and current official CLI. Deploy
  only a clearly named staging Worker/gateway.
- Bind the existing development Hyperdrive configuration that uses `app_rw`.
  Connection credentials must remain in Cloudflare, never Flutter or Git.
- Configure staging secrets/variables for the gateway cookie secret, EdDSA key,
  redirect allowlist, issuer, audience, JWKS, CORS, and Neon development Auth URL.
- Configure the API to verify only gateway-issued EdDSA JWTs using the gateway's
  HTTPS issuer/audience/JWKS.
- Verify `/healthz`, `/readyz`, JWKS, unauthenticated denial, authenticated
  `/v1/me`, and at least one tenant-scoped route from the deployed endpoints.
- Do not expose secret values in command output or the final report.

### 4. Finish the shared Flutter data path

- Add a typed API client using the in-memory access token supplied by
  `GatewayAuthService`.
- Keep SQLite as the offline cache. Add server UUID mapping, an operation queue,
  retry rules, explicit online/offline/syncing/conflict UI, and version or
  `updated_at` conflict detection.
- Port/connect vehicles, drivers, hires, service/expenses, income, remittances,
  reports, memberships, and invitations without weakening server authorization.
- A 401 must attempt one safe refresh and then sign out. A 403 is a permission
  error and must not retry. Only transient network/5xx failures retry.
- Preserve local backups. Never silently overwrite server data.
- Implement an owner-controlled initial-import dry run for the 65 local vehicles,
  deduplicated by normalized registration. Show conflicts and counts before any
  write. Stop for explicit approval before performing the real import into Neon.
- Test queue retries, idempotency, conflicts, offline edits, restart recovery,
  cross-fleet denial, and no duplicate imports.

### 5. Make iOS a first-class release target

- The owner uses an iPhone 17 Pro Max and an iPhone 7 Plus. Preserve
  `IPHONEOS_DEPLOYMENT_TARGET = 15.0`; do not raise it without explicit approval.
- Recheck every native plugin's minimum iOS version after dependency changes.
- Replace the placeholder `com.example.mobile` only after the permanent bundle ID
  and Apple Developer team are known.
- Add an HTTPS Universal Link callback, Associated Domains entitlement, and a
  matching `apple-app-site-association` file on the staging gateway. Keep the
  custom `fleetops://` callback development-only.
- Add equivalent verified Android App Links and `assetlinks.json` for release.
- Test responsive layout, safe areas, keyboard forms, text scaling, browser auth
  return, secure storage, session restore, sign-out, document alerts, and offline
  records at iPhone 7 Plus and iPhone 17 Pro Max dimensions.
- Do not claim an installable iOS build from Linux. A signed IPA/TestFlight build
  requires macOS, a current supported Xcode, an Apple Developer account,
  certificates, and a provisioning profile. Prepare the project/workflow and
  report the exact external Apple step if those are unavailable.

### 6. Final verification and handoff

- Run all backend, Worker, gateway, web, and Flutter checks.
- Verify invitation acceptance, role boundaries, invalid/expired/reused tokens,
  sign-out revocation, audit writes, RLS, and Fleet A/Fleet B isolation against
  development only.
- Update stale runbooks to match actual state.
- Review the complete diff for secrets and accidental unrelated changes.
- Do not push or publish production. A staging deployment is authorized; a real
  65-record import, App Store submission, production deployment, and destructive
  database operations require explicit confirmation.

## Completion report

Report only:

1. What now works end to end.
2. Staging URLs with no embedded credentials.
3. Changed files.
4. Tests/builds and exact results.
5. Remaining external console steps, especially Apple Developer/TestFlight.
6. Any blocker with one precise next action—never a vague loop of commands.

Do not call the app finished merely because it builds. It is finished for
staging only when two devices can authenticate, resolve server roles, and share
the same development fleet without bypassing permissions or losing offline data.
