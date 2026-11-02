# Neon Managed Better Auth × Flutter — integration audit

**Date:** 2026-10-31  
**Scope:** `mobile/lib/data/neon_auth_service.dart`, `mobile/lib/screens/auth_screen.dart`, `mobile/lib/main.dart`, `backend/src/auth/`, `backend/src/config.ts`, and the auth claims in the READMEs.  
**Question:** Is the current Neon Better Auth integration a supported, production-safe Flutter/native flow? If not, what must replace it?

---

## Verdict

**STOP. Do not ship or extend the current login flow as production authentication.**

Neon's managed product is now **Managed Better Auth**, built on **Better Auth 1.7.12**. Neon documents supported integrations for **Next.js, Vite + React, React Router, and TanStack Router only**. It publishes a **TypeScript SDK only**. There is **no Flutter/Dart/native SDK**, and **no documented native code-exchange or bearer-token handoff** for obtaining a Neon JWT outside the SDK-managed browser session.

The current app works around that gap by calling Better Auth's internal HTTP routes directly, scraping the `__Secure-neonauth.session_token` value out of `Set-Cookie`, storing it in platform secure storage, replaying it as a `Cookie` header, and exchanging it for a 15-minute JWT at `/token`. That is a **hand-rolled reimplementation of an SDK-managed credential**, not a supported integration. The endpoint paths, cookie name, rotation behaviour, origin/CSRF rules, and error codes are internal details of a managed service that Neon can change at any time.

The backend half is sound: Fastify verifies the JWT with JWKS, issuer, audience, expiry, and `sub`, then resolves fleet access from its own membership tables. The blocker is **how the native client obtains and holds the credential**, not how the API verifies it.

Per the audit brief, no insecure login code was added. This document records the safe architecture required instead.

---

## Answers to the five audit questions

| Question | Official answer (as of 2026-10-31) |
|---|---|
| **Exact Better Auth version** | Managed Better Auth runs **Better Auth 1.7.12**. Use `@neon/auth` **0.8.1+** (which ships a 1.7.12 client); a custom Better Auth client must be **1.7+**. |
| **Flutter / native support** | **None documented.** Supported frameworks are Next.js, Vite + React, React Router, TanStack Router. "Standalone frontend + backend" is *coming soon*; "other frameworks" are *based on demand*. The SDK is TypeScript (`@neon/auth`, `@neon/neon-js`). No Dart/Flutter/native page exists in the Auth docs or index. |
| **Token / JWT flow** | JWT plugin is supported. Tokens are **EdDSA (Ed25519)**, expire in **15 minutes**, and are fetched with `authClient.token()` or the `set-auth-jwt` response header from `getSession()`. Verify against `<AUTH_BASE_URL>/.well-known/jwks.json`. `iss` and `aud` are the **auth service origin** (scheme + host, no `/neondb/auth` path). Custom claims are not supported. |
| **OAuth callback requirements** | Register the provider redirect URI as **`{NEON_AUTH_BASE_URL}/callback/{provider}`**, not the app's callback URL. The `callbackURL` passed to `signIn.social()` must be on a **trusted domain**. Trusted domains are `https://` origins (or `localhost`); wildcards are supported. **Custom app schemes (`myapp://`) are not documented** and must not be assumed to work. Apple requires HTTPS. |
| **Fastify verification** | **No official Fastify plugin.** Neon gives a generic JOSE/JWKS example (Node `jose`, Python `PyJWT`, Go). The repo's `jose` + `createRemoteJWKSet` + `jwtVerify` implementation matches that guidance and is the correct side of the integration. |

### Sources read

- <https://neon.com/docs/auth/overview>
- <https://neon.com/docs/auth/about> — version 1.7.12, `@neon/auth` 0.8.1+
- <https://neon.com/docs/auth/roadmap> — supported frameworks, standalone architecture not supported
- <https://neon.com/docs/auth/authentication-flow> — cookie name, opaque session token, JWT issuance
- <https://neon.com/docs/auth/guides/plugins/jwt> — EdDSA, 15 min, JWKS, issuer/audience, limitations
- <https://neon.com/docs/auth/guides/plugins/email-otp> — OTP verification and reset flows
- <https://neon.com/docs/auth/guides/setup-oauth> — callback URI and trusted-domain rules
- <https://neon.com/docs/auth/guides/configure-domains> — HTTPS origins / localhost only
- <https://neon.com/docs/auth/production-checklist> — SMTP, verification, localhost
- <https://neon.com/docs/reference/javascript-sdk> — TypeScript-only client surface
- <https://www.better-auth.com/docs/plugins/email-otp> — endpoint paths used by the app

---

## What the app does today

### Mobile

`NeonAuthService` treats `NEON_AUTH_URL` as the full auth base URL and calls these paths relative to it:

| Purpose | Path | Contract status |
|---|---|---|
| Sign in | `POST /sign-in/email` | Better Auth route; not a public Neon REST contract |
| Sign up | `POST /sign-up/email` | Better Auth route; not a public Neon REST contract |
| Restore | `GET /get-session` | SDK-internal route |
| JWT | `GET /token` | SDK-internal route (`authClient.token()`) |
| Sign out | `POST /sign-out` | Better Auth route |
| Send verification OTP | `POST /email-otp/send-verification-otp` | Documented Better Auth/Neon flow |
| Verify email | `POST /email-otp/verify-email` | Documented Better Auth/Neon flow |
| Request reset OTP | `POST /email-otp/request-password-reset` | Documented Better Auth/Neon flow |
| Reset password | `POST /email-otp/reset-password` | Documented Better Auth/Neon flow |

Credential handling:

1. `_sessionCookieFromHeaders` scans `Set-Cookie` for `__Secure-neonauth.session_token=`.
2. It keeps only `name=value`; everything after the first `;` is discarded.
3. The cookie string is written to `flutter_secure_storage` under `neon_auth_session_cookie`.
4. Every authenticated request sets `Cookie: <stored value>` manually.
5. `getBearerToken()` calls `/token`, caches the JWT in memory, and refreshes it when `exp` is within 30 seconds.
6. The JWT is sent to Fastify as `Authorization: Bearer …`.
7. `loadApiSession()` calls `/v1/me`; the API resolves membership from `sub`.

`AuthScreen` supports email/password sign-in, sign-up, email OTP verification, OTP-based password reset, and a local-first "continue offline" path. No OAuth is implemented. There are **no tests** for `NeonAuthService`; the default build has no `--dart-define`, so the auth path is not exercised by the current emulator run.

### Backend

`backend/src/auth/jwtVerifier.ts`:

- `createRemoteJWKSet` with 5s timeout, 30s cooldown, 10-minute cache.
- `jwtVerify` with `issuer`, `audience`, `algorithms`, `clockTolerance`, `requiredClaims: ["sub", "exp"]`.
- Extracts and length-checks `sub`; does not trust `email` or `role`.
- `plugins.ts` accepts only `Authorization: Bearer <token>`, verifies, then loads the application user/membership.
- Config fails closed: all three auth variables or none.

This matches Neon's verification guidance. The one tightening worth making: Neon signs **EdDSA only**; the allowlist currently accepts RS/PS/ES/EdDSA. Restrict it to `["EdDSA"]` when the issuer is Neon.

---

## Findings

| ID | Severity | Finding |
|---|---|---|
| **A1** | **Blocker** | **No supported Flutter/native integration exists.** Neon documents web frameworks only and ships a TypeScript SDK. The Flutter client reimplements SDK-internal HTTP behaviour. |
| **A2** | **Blocker** | **No documented secure bearer-token handoff for native.** The JWT plugin is documented for microservices, separate web domains, and CLI tools — all using the SDK/session cookie. There is no native PKCE/code-exchange flow, no device-bound refresh token, and no contract for replaying the session cookie from an app. |
| **A3** | **High** | **Hard coupling to Better Auth 1.7.12 internals.** Endpoint paths, the `__Secure-neonauth.session_token` name, cookie rotation, error codes, and origin behaviour are not a public contract. A managed upgrade can break login silently, and the app has no compatibility check. |
| **A4** | **High** | **Zero automated coverage.** No unit, widget, integration, or contract tests cover sign-in, cookie capture, refresh, sign-out, OTP, reset, or failure paths. The flow has never been verified against a live branch in CI. |
| **A5** | **Medium** | **Manual `Set-Cookie` parsing discards all attributes.** `Expires`, `Max-Age`, `Path`, `Domain`, `Secure`, `SameSite`, and `HttpOnly` are dropped. Expiry/rotation are handled only implicitly by `/get-session` and `/token`. Any change in cookie shape breaks auth. |
| **A6** | **Medium** | **No HTTP timeouts.** `_request` and `loadApiSession` have no connection/read timeout. A hung auth call leaves the UI busy; sign-out can hang before local credentials are cleared. |
| **A7** | **Medium** | **Stored cookie is an unbound bearer credential.** Secure storage protects it at rest, but there is no device binding, rotation-on-use, reuse detection, or per-device revocation. A extracted backup/root compromise yields the full session until server expiry. Cookie sessions are inherently like this; native token designs normally are not. |
| **A8** | **Medium** | **Expired-session handling is inconsistent.** A 401/403 from `/get-session` clears local state, but a 401 from `/token` only throws "Please sign in again"; the stale cookie remains stored. |
| **A9** | **Medium** | **Audience configuration is a footgun.** `AUTH_AUDIENCE` must be the auth **origin** (`https://host`), not the base URL (`https://host/neondb/auth`). The Neon Node example checks issuer only; the Python/Go examples check audience. `.env.example` leaves all three blank with no example values. |
| **A10** | **Low** | **Algorithm allowlist is broader than the provider.** Accepts RS/PS/ES/EdDSA. Neon uses EdDSA only. Pin it. |
| **A11** | **Low** | **Docs overstate support.** `backend/README.md` says the client "uses the Neon Managed Better Auth REST API" and "Neon's supported `/auth/token` endpoint"; `mobile/README.md` says it "requests JWTs from Neon as needed". Neither is a documented native contract. Correct both. |
| **A12** | **Low** | **Base-URL terminology is inconsistent.** The auth-flow page writes `{NEON_AUTH_URL}/auth/sign-in/email`, while the real base URL already ends in `/neondb/auth`. The app appends paths to `NEON_AUTH_URL`, so it must be the full base URL. Add a startup assertion/normalisation and document it. |
| **A13** | **Low** | **Reset flow skips the explicit OTP check.** Neon's documented OTP reset does `request → check-verification-otp (type: forget-password) → reset`. The app goes straight to reset. The server still validates the OTP, so this is a UX deviation, not a bypass. |
| **A14** | **Low** | **Public sign-up is open.** Neon says anyone can sign up by default; restricted signups are not available yet. Identity alone grants no fleet data (good), but the app exposes account/email/OTP abuse surface. Production needs verification plus custom SMTP and out-of-band membership provisioning. |
| **A15** | **Info** | **OAuth is not implemented.** If added, a custom-scheme callback is not a documented trusted domain. The only viable path is a trusted HTTPS callback that then hands off to the app. |
| **A16** | **Info (good)** | **Backend verification is correct.** JWKS, issuer, audience, expiry, `sub`, and DB membership are all checked. No change needed beyond pinning EdDSA and documenting the origin values. |

---

## Why the current flow is not "secure enough to bless"

The cookie stored in the app is **the same credential a browser would hold**. It is opaque, long-lived, and bearer-like:

- Anyone who can read it can replay it against the auth service and mint JWTs.
- It is not bound to the device, app instance, or user presence.
- It is not rotated on every use; the app only stores a replacement when the server happens to send one.
- There is no revocation endpoint the app can call per device beyond signing out the whole session.
- The app cannot detect a stolen cookie; the server sees a valid session.

Platform secure storage is the right place for a secret, but it does not turn a browser session cookie into a native auth design. The supported native pattern is **system browser + PKCE + one-time code exchange + short-lived access token + rotating refresh token**, with the provider session cookie kept server-side. That is what Neon's managed service does not currently expose to Flutter.

Additionally, the flow depends on undocumented behaviour:

- Whether Better Auth accepts cookie-authenticated POSTs with **no `Origin` header** from a native client.
- Whether the cookie is rotated on `/get-session`, `/token`, or only on sign-in.
- Whether `/token` remains a stable path.
- Whether the cookie name/prefix changes with a Better Auth upgrade.
- Whether `SameSite=None` / origin checks change (the auth-flow page says `SameSite=None`; the Next.js troubleshooting page describes a stricter default in another context — the docs are not a stable native contract).

None of those are safe assumptions for a production mobile app.

---

## Required safe architecture

### Option A — Managed auth gateway + native PKCE handoff (recommended)

Keep Neon Managed Better Auth on its **supported** surface (a web app using the official SDK), and put a small **backend-for-frontend (BFF) auth gateway** in front of it. The Flutter app never sees the Neon session cookie.

```
Flutter app                Auth gateway (Next.js, trusted HTTPS)          Neon Managed Better Auth
-----------                --------------------------------------          ------------------------
generate PKCE + state  →   /mobile/start  (system browser)          →     official SDK sign-in
                           first-party Neon session cookie
                           (server-side only)
                           create one-time code (≤60s, hashed)
                       ←   redirect to HTTPS /mobile/complete
                           → universal link / app link
receive code           ←
POST code + verifier   →   /mobile/exchange
                       ←   short-lived access JWT + rotating refresh token
Authorization: Bearer  →   Fastify API  →  verify JWT (JWKS, iss, aud, exp, sub)  →  DB membership
```

**Components**

1. **Auth gateway** — a Next.js App Router app on a trusted HTTPS origin (for example `https://auth.example.com`), using `@neon/auth/next` and the documented `app/api/auth/[...path]` proxy. This is the supported integration. Its server code holds the Neon session; the browser only talks to the gateway origin.
2. **`/mobile/start`** — accepts `code_challenge` (S256) and `state`, stores them in a signed, HttpOnly, short-lived cookie, and renders/redirects to the official sign-in UI (email/password and, if required, OAuth).
3. **`/mobile/authorize`** — after a Neon session exists, reads it through the supported server SDK, creates a random one-time code, stores only its hash with a ≤60s TTL bound to the PKCE challenge and a device label, and redirects to an HTTPS completion page.
4. **Deep link** — prefer an **HTTPS universal link / Android App Link** back into the app (for example `https://app.example.com/auth/callback?code=…&state=…`). A custom scheme is acceptable only as a fallback and only with PKCE + one-time code + state; do not point OAuth directly at a custom scheme.
5. **`/mobile/exchange`** — verifies `state`, the PKCE verifier, code hash, TTL, and single use; returns:
   - a **short-lived access JWT** (5–15 min), and
   - an **opaque rotating refresh token** (hashed at rest, device-bound, revocable, reuse-detected).
6. **Token choice** — either forward Neon's 15-minute JWT (keeps Fastify's Neon JWKS config unchanged) or have the gateway mint its own JWT with `sub` = Neon user id (more control, full revocation). Do not put fleet roles in the token; keep resolving membership from the database.
7. **Flutter** — use the **system browser** (`ASWebAuthenticationSession` on iOS, Custom Tabs on Android; e.g. `flutter_web_auth_2`), not a WebView. Store only the refresh token in `flutter_secure_storage`. Keep access tokens in memory. On 401, refresh once; on refresh failure, sign out.
8. **Fastify** — for Neon JWTs keep `AUTH_ISSUER`/`AUTH_AUDIENCE` = auth origin and `AUTH_JWKS_URL` = base + `/.well-known/jwks.json`, pin `algorithms: ["EdDSA"]`. For gateway-minted JWTs, point issuer/audience/JWKS at the gateway and document the trust boundary.

**Hard requirements**

- The Neon session cookie never leaves the gateway.
- No WebView for authentication.
- PKCE S256, `state`, one-time code, short TTL, single use.
- Access token ≤15 min; refresh token rotation with reuse detection and revocation.
- No passwords or provider tokens in logs, analytics, or crash reports.
- Curated user-facing errors; never surface raw provider payloads.
- Tests: PKCE mismatch, state mismatch, code reuse, expiry, refresh rotation/reuse, logout revocation, wrong issuer/audience/alg/exp/kid, unknown `sub`, missing membership.
- End-to-end run against a **development** Neon branch before any release build enables auth.

### Option B — Self-host Better Auth (only if an extra gateway is unacceptable)

Run Better Auth yourself (Node/Fastify) against Neon Postgres, with the documented server API and the `bearer`/`jwt` plugins, and own the native contract end to end. This removes managed-version coupling but:

- There is still **no official Flutter SDK**; you own the client implementation and its security.
- You own keys, rotation, migrations, rate limits, SMTP, OAuth apps, and upgrades.
- It is a larger change than Option A and should be a deliberate decision, not a workaround.

### Option C — Stay local-first

Keep the current offline-first default and do not enable cloud login in release builds until Option A is built. This is the zero-risk interim state and is already how the default build behaves.

---

## Do not do

- Do not ship the current cookie-replay client to production.
- Do not add `Origin`/CORS workarounds to force native requests through the browser flow.
- Do not put the Neon session cookie in `SharedPreferences`, logs, or a WebView.
- Do not point OAuth at `myapp://…` and assume Neon's trusted-domain allowlist accepts it.
- Do not use a WebView for sign-in (RFC 8252 recommends the system browser).
- Do not trust `email`, `role`, or other JWT claims for fleet authorization; keep using `sub` + DB membership.
- Do not describe the current flow as "supported by Neon" in the READMEs.

---

## What is already good (keep it)

- Backend JWT verification via JWKS with issuer, audience, expiry, `sub`, and clock tolerance.
- Membership/role resolution in the API database, not in the token.
- Fail-closed auth config (all three variables or none).
- Secure storage for the credential rather than plain preferences.
- Curated error messages; no raw provider errors in the UI.
- Local-first fallback when auth is not configured.
- No password persistence in the app.

---

## Immediate actions (documentation-only until a decision)

1. **Do not enable `NEON_AUTH_URL` in release builds.** Keep the local-first default.
2. Mark `NeonAuthService` as **experimental / unsupported** in code comments and treat it as a development spike.
3. Correct the auth claims in:
   - `backend/README.md` ("uses the … REST API", "supported `/auth/token` endpoint"),
   - `mobile/README.md` ("requests JWTs from Neon as needed").
4. Reference this audit from `docs/cloudflare-workers-migration.md` item 32 ("Confirm that Flutter can obtain a credential…"), which is still unchecked and is the correct gate.
5. Decide between Option A (gateway) and Option C (local-first for now) before writing more auth code. Option B only if self-hosting is explicitly chosen.
6. When Option A is approved, add the gateway and its tests first, then change Fastify's issuer/audience/JWKS only if the gateway mints its own tokens.

---

## Open decisions

- Where will the auth gateway run (Next.js on Node, Cloudflare Workers with the Next.js adapter, or another supported Next.js host)?
- Is OAuth required at launch, or is email/password + OTP verification enough?
- Is a second deployable (the gateway) acceptable, or is self-hosting Better Auth preferred?
- What is the refresh-token lifetime and revocation policy (per device, per user, admin revoke)?
- Which deep-link mechanism will be used (HTTPS App/Universal Links vs custom scheme fallback)?

---

## Bottom line

The **API-side JWT verification is production-shaped**. The **Flutter-side credential acquisition is not supported** by Neon and is not safe to ship as-is. Neon provides neither a Flutter-native SDK nor a documented native bearer-token handoff. The correct next step is the **gateway + system-browser + PKCE + one-time-code + rotating-refresh-token** architecture above, or stay local-first until it exists.
