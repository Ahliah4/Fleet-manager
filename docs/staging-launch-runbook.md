# Fleet Operations staging launch runbook

This is the single checklist for finishing the shared Fleet Operations app.
Everything below is for the Neon `development` branch and a non-production
staging deployment. Never paste passwords, database URLs, bearer tokens, or
signing secrets into chat or source control.

## Current state

- Flutter local-first app works on the phone and keeps records in SQLite.
- The recovered local dataset contains 65 vehicles.
- Fastify API has tenant isolation, role checks, audit logging, RLS context,
  JWKS verification, and 67 passing tests.
- The Cloudflare Worker has a separate 10-test route/runtime suite.
- The browser auth gateway builds, type-checks, and has 12 passing tests for
  code exchange, replay, wrong verifier, refresh rotation, family revocation,
  sign-out revocation, and fail-closed production storage.
- The gateway now has a Cloudflare SQLite Durable Object code/refresh-token
  store. It stores only SHA-256 hashes, rotates refresh tokens atomically,
  records a token family ID, and revokes the family when a rotated token is
  replayed. The in-memory adapter is rejected when `NODE_ENV=production`.
- The development Worker now has vehicle, driver, hire, finance, and
  owner/admin invitation route coverage with RLS context and audit writes.
- Flutter analysis is clean and 27 tests pass, including queue durability,
  server-ID uniqueness, and delete tombstones.
- Flutter now has a typed fleet API client, a durable SQLite outbox, server-ID
  mappings, conflict recording, one safe 401 refresh, no retry on 403, and a
  Settings sync/import-preview surface.
- The old direct Flutter-to-Neon cookie flow is disabled unless an explicit
  development-only flag is supplied.
- `backend/migrations/0004_membership_invitations.sql` is applied on Neon
  `development`; owner bootstrap has been verified.
- Android has an INTERNET permission, an HTTPS App Link intent filter, and a
  manifest host placeholder. iOS has the Associated Domains entitlement and a
  configurable App Link host. The gateway serves both verification files when
  their environment variables are configured.

The phone app is therefore usable offline and has a shared-data client, but it
is not yet a verified live workspace. Two physical phones have not completed a
two-device sync test, and no staging deployment has been made.

## Finish order

### 1. Choose the staging address

Use either an IP Motors-owned HTTPS domain or a temporary Cloudflare staging
address. The address is required for Neon trusted domains, OAuth callbacks,
Android App Links, and the mobile browser handoff. Do not use a random HTTP
address for staging auth.

### 2. Configure Neon development Better Auth

In the `development` branch only:

1. Keep email/password and verification enabled.
2. Configure a real email provider before inviting users.
3. Add the chosen HTTPS staging origin to trusted domains.
4. Copy the Auth URL and JWKS URL into the gateway's server-side deployment
   settings.
5. If Google sign-in is wanted, configure its provider callback for the Neon
   Auth callback URL; the mobile app must still return through the HTTPS handoff.

The API values are server-side only:

```text
AUTH_ISSUER=<gateway HTTPS origin>
AUTH_AUDIENCE=<gateway API audience>
AUTH_JWKS_URL=<gateway HTTPS origin>/.well-known/jwks.json
```

Do not put any of these values in a password field, SQLite, logs, or a mobile
secret store. The issuer/audience are configuration values; the database URL
and cookie secret remain server-side secrets.

All `*.workers.dev` hostnames share the `workers.dev` zone, so a Worker
fetching another Worker's public `*.workers.dev` URL is blocked with Cloudflare
error 1042. Both the PWA and the API therefore use service bindings:

- `fleet-manager`: `AUTH_GATEWAY` → `auth-gateway`, `FLEET_API` → `ip-motors-fleet-api-development`
- `ip-motors-fleet-api-development`: `AUTH_GATEWAY` → `auth-gateway`

The API still reads `AUTH_JWKS_URL` for its issuer/audience configuration, but
the verifier fetches the JWKS through `AUTH_GATEWAY`. Do not replace these
bindings with public URL fetches; doing so breaks sign-in and the API proxy.

### 3. Complete the secure mobile handoff before staging deployment

The auth gateway uses the official Neon web SDK and keeps the Neon browser
session cookie on the gateway. The local system-browser PKCE handoff is now
implemented:

```text
Flutter -> HTTPS gateway /mobile/start
gateway -> Neon official auth UI
gateway -> one-time code bound to PKCE/state
gateway -> HTTPS app-link callback
Flutter -> gateway /mobile/exchange
Flutter -> Fastify Authorization: Bearer <verified short-lived token>
```

The gateway's browser flow includes supported password recovery pages. Its
durable store is a Cloudflare SQLite Durable Object and is enabled by the
gateway's Cloudflare configuration; it does not need another Neon migration or
database credential:

1. Deploy the gateway with its `MobileAuthFlowStore` Durable Object binding.
2. Generate the gateway EdDSA key pair and set the issuer, audience, private
   JWK, and public JWK. Publish the JWKS URL to Fastify.
3. Set the exact `MOBILE_REDIRECT_URIS`, `IOS_APP_TEAM_ID`, `IOS_BUNDLE_ID`,
   `ANDROID_APP_PACKAGE`, and `ANDROID_SHA256_CERT_FINGERPRINTS` values. The
   gateway returns 404 for an unconfigured association file rather than
   publishing a partial one.

The custom `fleetops://` scheme remains the browser-session callback for iOS
15. The official `flutter_web_auth_2` HTTPS callback support requires iOS 17.4
or newer, so removing the custom scheme would break the owner's iPhone 7 Plus.
The callback is still bound to a random PKCE verifier and state, uses a
60-second single-use code, and never returns the Neon browser cookie to
Flutter. The HTTPS App Link/Universal Link remains the verified deep-link and
fallback route for supported systems. Do not revive the disabled cookie-replay
client.

The deployed development Worker uses Neon's supported serverless WebSocket
driver. Its `app_rw` development connection is stored as the `DATABASE_URL`
Cloudflare Worker secret; it is never stored in Flutter or the repository.
The Hyperdrive binding was deliberately removed from this deployment after
Cloudflare rejected a valid configuration during binding generation. Do not
point the Worker at production while that support issue remains unresolved.

### 4. Membership migration and initial owner

`backend/migrations/0004_membership_invitations.sql` is already applied to Neon
`development`, and the initial Fleet Owner bootstrap has succeeded. Do not run
either operation again as part of staging deployment. The migration creates
owner/admin-controlled invitations and a narrowly scoped acceptance function.
It does not grant roles from public signup and it cannot assign Fleet Owner or
Super Admin through an invitation.

The initial Fleet Owner is a separate controlled bootstrap action. Choose the
person who legally controls the fleet; do not let the first public signup
become owner automatically. After bootstrap, that owner invites administrators,
managers, finance users, and read-only users from the app.

The repository keeps the operator-only commands below for disaster recovery
and a future clean environment. They are historical reference, not remaining
launch steps. Run them only against an explicitly confirmed non-production
target and keep all values in your private terminal:

```text
npm run migrate -- --status
npm run migrate:apply -- --confirm-target=<development-host/database>
npm run bootstrap:owner -- \
  --email=<owner-email> \
  --subject=<Neon-user-subject> \
  --display-name=<owner-name> \
  --fleet-name=<fleet-name> \
  --confirm-target=<development-host/database>
```

The bootstrap command refuses a pooler endpoint, refuses a mismatched target,
and refuses to create a second active membership for the identity.

### 5. Define the sync policy before importing the 65 vehicles

Use the existing local records as the import source once, then make the server
the shared source of truth:

- Preserve the local registration number as the initial deduplication key.
- Upload vehicles, drivers, hires, finance entries, and document dates in a
  reviewed import transaction.
- Never silently overwrite a server record; show conflicts by registration and
  let an owner choose the winning value.
- After the initial import, edits queue locally while offline and sync when
  online using server IDs and `updated_at`/version checks.
- Deletes remain soft deletes and require the existing permission checks.
- Export a backup before the first import; restore replaces local records.

The Flutter queue and server-ID mapping now exist. Each local write is captured
by SQLite triggers into `sync_outbox`; the sync service pushes drivers and
vehicles first, then hires and finance records, and never overwrites a local
row with an unsynced edit. A 401 attempts one refresh then signs out, a 403 is
never retried, and transient failures back off. The settings screen shows the
queue, conflict count, last sync, and a vehicle-import dry run.

The real 65-record import is still deliberately blocked. Run the dry run,
review new/matched/conflict/invalid counts, take a backup, and obtain explicit
owner approval before any import that writes to Neon. Server-side deletion
tombstones are not pulled yet; local deletes are pushed.

### 6. Validate staging

Run these checks against staging/development only:

- Sign up and verify an account.
- Confirm the account has no fleet until the owner invites it.
- Invite a member, accept the invitation, and confirm `/v1/me` shows the
  server-resolved role and fleet.
- Confirm an invalid, expired, reused, or cross-fleet invitation is rejected.
- Confirm an expired/incorrect JWT is rejected and no protected data leaks.
- Confirm a user in Fleet A cannot read or write Fleet B.
- Confirm owner/admin/member/read-only permissions match the role matrix.
- Confirm the 65-record import and conflict handling on a staging backup.
- Confirm sign-out clears mobile refresh credentials and API access stops.

Only after all checks pass should a signed release APK be built with the
gateway/API configuration. Do not enable auth defines on the current local-only
APK and do not deploy production.

## Current decisions

The selected staging plan is a temporary Cloudflare address, the initial Fleet
Owner is you, and Google sign-in is wanted. These decisions are recorded; they
do not authorize production changes.

## Required iPhone compatibility

The Fleet Operations app must support both of the owner's phones:

- iPhone 17 Pro Max on the current iOS release.
- iPhone 7 Plus on iOS 15.

The Flutter iOS project intentionally keeps `IPHONEOS_DEPLOYMENT_TARGET = 15.0`.
Do not raise the deployment target without explicitly dropping iPhone 7 Plus
support. The currently selected native plugins have minimum iOS versions at or
below 15, but this must be rechecked whenever dependencies are upgraded.

Before distributing an iOS build:

1. Choose the permanent Apple bundle identifier and register it in the Apple
   Developer account; `com.example.mobile` is only a development placeholder.
2. Build and sign the IPA on macOS using a current supported Xcode version.
   Linux can analyze and test the Flutter code, but cannot create the signed iOS
   release archive.
3. Set `APP_LINK_HOST` in the iOS xcconfig and Gradle (`-PAPP_LINK_HOST=...`)
   to the HTTPS gateway host, and host matching
   `apple-app-site-association`/`assetlinks.json` files. Keep the PKCE-protected
   custom callback in the release build because the iPhone 7 Plus is limited
   to iOS 15; HTTPS auth callbacks are available only on iOS 17.4 and newer.
4. Test sign-in, callback return, secure session restore, sign-out, offline data,
   backup/restore, document alerts, keyboard forms, and text scaling on both
   physical phones.
5. Distribute the staging build through TestFlight before an App Store release.

## Remaining release blockers

The code is substantially implemented, but a safe shared release still needs:

- A staging deployment. There is no Cloudflare CLI/account session in this
  workspace, so no Worker or gateway deployment was made.
- Cloudflare authentication in the deployment terminal, followed by staging
  deployment of the gateway and API Worker. Durable auth storage and EdDSA
  keys exist locally, but the deployed issuer/JWKS/API URLs must be updated to
  the final HTTPS staging addresses.
- The permanent Apple bundle ID/team and the release App Link host. The current
  `com.example.mobile` and `fleet-staging.invalid` values are placeholders.
- A macOS/Xcode signed archive and TestFlight upload.
- Two physical phones signed in at the same time, with shared roles, one fleet,
  offline edits, conflict review, backup/restore, and sign-out verified.
- Explicit owner approval for the real 65-record import.

Until those are complete, the APK remains a local-first/staging client, not a
public release.
