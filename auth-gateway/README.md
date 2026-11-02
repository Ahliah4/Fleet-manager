# Fleet Operations auth gateway

This local Next.js service uses Neon's supported `@neon/auth` Next.js SDK for
browser authentication on the **development** branch. It intentionally does
not expose or store Neon session cookies in Flutter.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set `NEON_AUTH_BASE_URL` to the full development-branch Auth URL.
3. Generate a local `NEON_AUTH_COOKIE_SECRET` with `openssl rand -base64 32`.
4. Install dependencies and run `npm run dev`.

The browser opens at `http://localhost:3000`. Neon development settings must
allow localhost. Google shared credentials are suitable only for development.

## Mobile handoff status

The repository contains the browser-to-mobile PKCE routes and the Flutter
client. Local development can use `MOBILE_FLOW_STORAGE=memory`, but that store
is deliberately rejected when `NODE_ENV=production`: a process restart would
otherwise lose one-time codes and refresh-token revocation state.

For Cloudflare staging and release, `cloudflare.config.ts` sets
`MOBILE_FLOW_STORAGE=durable-object` and binds the SQLite-backed
`MobileAuthFlowStore`. One object is used per authorization code or refresh
family, so refresh rotation and replacement insertion are one serialized
transaction. The store keeps only SHA-256 hashes; replaying a rotated token
revokes the complete family. It does not require an additional Neon table or
database credential. Run `npm test` for the flow, replay, rotation, revocation,
and fail-closed checks.

Before a release build, configure an HTTPS App Link / iOS Universal Link,
publish the gateway JWKS URL to the Fastify verifier, and keep the custom
`fleetops://` callback for development only. Never send a Neon browser cookie to
Flutter.
