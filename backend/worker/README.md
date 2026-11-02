# IP Motors Fleet API Worker (development)

This Worker is an isolated Cloudflare runtime proof alongside the existing Fastify API. It is pinned to a development-named Worker and does not replace the Node API or migration runner. It exposes health/readiness, authenticated `/v1/me`, vehicle CRUD/restore, drivers, hires, finance records, and owner/admin invitation endpoints. Platform-admin routes remain on Fastify.

## Runtime and database

The Worker uses Hono on the Fetch runtime and node-postgres (`pg`) with a Cloudflare Hyperdrive binding. It creates one `pg.Client` for each request-side transaction; Hyperdrive owns the origin connection pool. Transaction-scoped `app.*` RLS context is applied on the same client that performs each protected query. This preserves the development database's `app_rw` role and its RLS behavior.

The Hyperdrive configuration must target Neon branch `development`, using the existing `app_rw` role. Create it in Cloudflare's Hyperdrive dashboard, keep the connection values there, and set its non-secret ID as `FLEET_DEVELOPMENT_HYPERDRIVE_ID` for local `cf` project commands. Do not use the production database or add a database URL to this repo.

## Auth and local development

Set the following names in your local shell or Cloudflare Worker configuration, using values from Neon Auth on the `development` branch:

- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_JWKS_URL`
- `AUTH_CLOCK_TOLERANCE_SECONDS` (optional; defaults to 30)
- `CORS_ORIGIN` (optional; exact allowed browser origin)
- `DATABASE_EXPECTED_ROLE` (optional; defaults to `app_rw`)

These auth values must match the real Neon Auth JWT configuration. The verifier validates the issuer, audience, expiry, subject, and supported asymmetric signing algorithms against the configured JWKS. Missing auth configuration fails closed for protected routes. Never put secrets or database URLs in Flutter or commit local environment files.

With `cf` installed and authenticated, run `npm run dev` for local Worker development or `npm run build` to build. Building is local; `cf deploy` is intentionally not part of this setup until route parity and development isolation checks are complete.

The existing `backend/scripts/migrate.ts` remains a separate Node command. Do not run it from the Worker, and do not automatically apply migrations on Worker startup.

## Remaining release gates

Do not deploy this Worker as the shared app API until the development-only
membership migration is applied and verified, the owner is bootstrapped, and
the Flutter app has a supported HTTPS/PKCE auth handoff plus an explicit sync
contract. The current Flutter build remains local-first by design.
