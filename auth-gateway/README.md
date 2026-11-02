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

The repository now contains the browser-to-mobile PKCE routes and Flutter
client. Local development can use `MOBILE_FLOW_STORAGE=memory`, but that store
is deliberately rejected when `NODE_ENV=production`: a process restart would
otherwise lose one-time codes and refresh-token revocation state. Before any
staging or release deployment, replace it with a Cloudflare Durable Object/KV
adapter, configure an HTTPS App Link / iOS Universal Link, and publish the
gateway JWKS URL to the Fastify verifier. Never send a Neon browser cookie to
Flutter.
