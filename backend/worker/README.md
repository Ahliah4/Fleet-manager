# IP Motors Fleet API Worker (development)

This Worker is an isolated Cloudflare runtime proof alongside the existing Fastify API. It is pinned to a development-named Worker and does not replace the Node API or migration runner. It exposes health/readiness, authenticated `/v1/me`, vehicle CRUD/restore, drivers, hires, finance records, and owner/admin invitation endpoints. Platform-admin routes remain on Fastify.

## Runtime and database

The Worker uses Hono on the Fetch runtime and Neon's supported serverless driver over WebSockets. It creates one Neon `Pool` inside each request-side transaction and closes it before the response completes. Transaction-scoped `app.*` RLS context is applied on the same client that performs each protected query. This preserves the development database's `app_rw` role and its RLS behavior.

The deployed development Worker stores the Neon `app_rw` connection only as its `DATABASE_URL` Cloudflare secret. Do not use the production database or add a database URL to this repo, Flutter, or a Worker text binding. Hyperdrive remains optional future infrastructure; it is not bound to the deployed Worker while Cloudflare resolves its binding-generation error.

## Auth and local development

Set the following names in your local shell or Cloudflare Worker configuration, using values from Neon Auth on the `development` branch:

- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_JWKS_URL`
- `AUTH_CLOCK_TOLERANCE_SECONDS` (optional; defaults to 30)
- `CORS_ORIGIN` (optional; exact allowed browser origin)
- `DATABASE_EXPECTED_ROLE` (optional; defaults to `app_rw`)
- `DATABASE_URL` (local development only, or a Cloudflare Worker secret when deployed)

These auth values must match the real Neon Auth JWT configuration. The verifier validates the issuer, audience, expiry, subject, and supported asymmetric signing algorithms against the configured JWKS. Missing auth configuration fails closed for protected routes. Never put secrets or database URLs in Flutter or commit local environment files.

With `cf` installed and authenticated, run `npm run dev` for local Worker development or `npm run build` to build. The isolated development Worker is deployed; it is not the production API and must not receive production credentials.

The existing `backend/scripts/migrate.ts` remains a separate Node command. Do not run it from the Worker, and do not automatically apply migrations on Worker startup.

## Remaining release gates

Do not deploy this Worker as the shared app API until the development-only
membership migration is applied and verified, the owner is bootstrapped, and
the Flutter app has a supported HTTPS/PKCE auth handoff plus an explicit sync
contract. The current Flutter build remains local-first by design.
