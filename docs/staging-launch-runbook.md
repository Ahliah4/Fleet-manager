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
- The browser auth gateway builds and type-checks, and contains a local PKCE
  handoff implementation.
- The development Worker now has vehicle, driver, hire, finance, and
  owner/admin invitation route coverage with RLS context and audit writes.
- Flutter analysis is clean and 24 tests pass.
- The old direct Flutter-to-Neon cookie flow is disabled unless an explicit
  development-only flag is supplied.
- `backend/migrations/0004_membership_invitations.sql` is applied on Neon
  `development`; owner bootstrap has been verified.

The phone app is therefore usable offline, but it is not yet a shared live
workspace. Two phones currently have separate local copies.

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

The gateway's browser flow includes supported password recovery pages. It still
needs a durable single-use code/refresh-token store (the current in-memory
adapter is local-only), HTTPS Android/iOS app-link configuration, and a
generated gateway EdDSA key pair before a release build can enable shared
sign-in. Do not revive the disabled cookie-replay client.

For the Worker, keep the Hyperdrive binding pointed at the `development`
branch using `app_rw`. Local development may use the ignored variable
`FLEET_DEVELOPMENT_HYPERDRIVE_CONNECTION_STRING`; production/staging stores
the connection in Cloudflare, not in the repository or Flutter.

### 4. Apply the membership migration only after review

An operator must review and apply `backend/migrations/0004_membership_invitations.sql`
to Neon `development` only. It creates owner/admin-controlled invitations and
a narrowly scoped acceptance function. It does not grant roles from public
signup and it cannot assign Fleet Owner or Super Admin through an invitation.

The initial Fleet Owner is a separate controlled bootstrap action. Choose the
person who legally controls the fleet; do not let the first public signup
become owner automatically. After bootstrap, that owner invites administrators,
managers, finance users, and read-only users from the app.

The repository now includes an operator-only bootstrap command. Run it from
`backend/` only after reviewing the target shown by the migration status
command; keep all values in your private terminal:

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

The current Flutter screens do not yet implement this sync queue. It must be
implemented and tested before claiming that two phones share live data.

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
3. Add the gateway HTTPS domain to the Associated Domains entitlement and host
   a matching `apple-app-site-association` file. The release auth callback must
   use that verified Universal Link, not the local `fleetops://` development
   scheme.
4. Test sign-in, callback return, secure session restore, sign-out, offline data,
   backup/restore, document alerts, keyboard forms, and text scaling on both
   physical phones.
5. Distribute the staging build through TestFlight before an App Store release.

## Remaining release blockers

The code is validated, but a safe shared release still needs durable gateway
mobile-session storage, Android App Links and iOS Universal Links, Apple release
signing, gateway EdDSA key/JWKS configuration, the Flutter initial import/sync
contract, and staging verification. Until
these are completed, the APK should remain local-first and the Worker should
not be deployed as the shared API.
