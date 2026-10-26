# D-02 — Identity provider and session model

**Status:** Proposed — awaiting product-owner sign-off
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD §7.1, §9 (Identity decision), §11, §16 (which identity provider)
**Depends on:** D-01 (roles and membership)
**Blocks:** Phase 1 authentication, invitations, MFA, migration
**Critical path:** yes — start the spike as soon as D-01 is signed

## 1. Context

Today authentication is entirely Supabase Auth: email/password, sign-up, sign-in,
password reset, and an admin-created-user Edge Function
(`src/lib/authContext.jsx`, `supabase/functions/admin-create-user/index.ts`). Neon
is a PostgreSQL host, not an authentication product. The new API must verify a
trusted identity and derive fleet membership from the database. It must not trust a
client-supplied role or `fleet_id`.

The identity choice determines:

- how users sign in, reset passwords, accept invitations, and enable MFA;
- what claims the API can trust;
- whether existing password hashes can be imported or users must reset;
- how Super Admin MFA and session revocation work;
- how much custom security code the project owns.

## 2. Requirements

### 2.1 Must have

| Requirement | Why |
|---|---|
| Email + password (or passwordless) with verified email | Existing users and small-fleet onboarding |
| Password reset | Current product feature |
| Secure invitation flow | PRD §7.1; avoids plaintext temporary passwords |
| MFA (TOTP and/or WebAuthn) | Super Admin mandatory; Fleet Admin assessed before launch |
| Session expiry and revocation | PRD §11; required for member removal and role changes |
| OIDC/JWT with JWKS | API can verify tokens without shared secrets |
| Admin API / webhooks | Create, suspend, restore, revoke users; sync status |
| Rate limiting on auth endpoints | PRD §11 |
| Audit/event log export | Security review and incident response |
| Password hash import **or** a workable forced-reset plan | Migration |
| Data residency / region choice | Privacy review |
| Reasonable pricing at 10× expected scale | Commercial sustainability |

### 2.2 Should have

- Organisation/tenant primitives (useful for mapping fleets, but membership remains
  in our database).
- Custom claims or metadata (hints only; never authoritative for authorization).
- Branded emails and hosted pages.
- SOC 2 / ISO 27001 evidence, DPA, sub-processor list.
- Self-service account deletion / export.
- WebAuthn/passkeys for a better mobile experience.

### 2.3 Out of scope

- Social login in v1.
- Enterprise SSO/SAML (possible later).
- Building a custom password database or rolling our own MFA.

## 3. Options

Scores are qualitative; validate in the spike. Pricing changes frequently and must
be confirmed with current vendor quotes.

| Option | Strengths | Weaknesses / risks | Fit |
|---|---|---|---|
| **Managed OIDC provider (Auth0 / Okta CIC)** | Mature MFA, invitations, admin API, broad docs, password-hash import options | Cost at scale; configuration complexity; vendor lock-in | Strong default |
| **Clerk** | Strong developer experience, prebuilt UI, organisations, MFA, good Next.js/React support | Pricing; React-centric docs; verify mobile/Flutter and OIDC support depth | Strong candidate |
| **WorkOS** | Enterprise SSO/SCIM, good admin APIs | More enterprise-oriented; may be overkill for small fleets | Consider if SSO becomes a requirement |
| **Neon Auth** | Close to the database; potential operational simplicity | Newer; verify MFA, invitations, admin API, Flutter support, region, and migration maturity before relying on it | Evaluate in spike |
| **Supabase Auth retained as IdP** | No migration of auth users; familiar; good email/password/reset; RLS integration | Keeps a vendor the PRD is moving away from; Neon is only the DB; still need to build roles/memberships | Viable interim, weaker strategic fit |
| **Self-hosted Better Auth / Keycloak** | Control, data residency, no per-user fee | Operational burden: upgrades, backups, HA, security patching; MFA/invite UX to build | Only with a strong ops reason |

### Recommendation

Choose a **managed OIDC identity provider** that passes the spike, rather than
building authentication. Prefer a provider with:

- native invitations and MFA,
- a documented admin API and webhooks,
- JWKS-based token verification,
- a clear path for existing users (hash import or forced reset),
- a region compatible with the API/Neon deployment.

Run the spike with **two** shortlisted providers (for example Auth0 and Clerk, plus
Neon Auth if it meets the must-haves). Do not wait for a perfect comparison; pick the
one that passes the must-haves and has the lowest operational burden.

If the spike fails on migration or MFA, keep Supabase Auth temporarily as the IdP
while the API and Flutter client are built, and schedule the IdP swap before public
launch. Do not build new role logic inside Supabase Auth.

## 4. Recommended token and claim model

### 4.1 Access token

The API validates:

- signature via the provider's JWKS (cached, rotated safely),
- `iss` and `aud` exactly match the configured values,
- `exp`/`nbf` with a small clock skew,
- `sub` is present and maps to a local `users` row.

Use short-lived access tokens (10–15 minutes) with refresh-token rotation. Revoke
refresh tokens on member removal, suspension, role change, password reset, and MFA
reset.

### 4.2 Claims

| Claim | Use |
|---|---|
| `sub` | Stable identity key; map to `users.idp_subject` |
| `email`, `email_verified` | Display and invitation matching; require verified for invitations |
| `amr` / `acr` / `aal` (provider-specific) | Detect MFA strength for Super Admin and step-up |
| `exp`, `iat`, `iss`, `aud` | Standard validation |
| `name` | Display hint only; profile name lives in our DB |
| `fleet_id`, `role` | **Do not trust for authorization.** If present as hints, re-check against `fleet_memberships` on every request |

Authorization flow per request:

```
JWT verified → users row by idp_subject → active fleet_membership
→ role + fleet policy → target row ownership → allow/deny → audit
```

Never accept `fleet_id`, `role`, or `user_id` from a request body as an
authorization input. Never let the client choose its fleet context without a
server-side membership check.

### 4.3 MFA

- Super Admin: mandatory MFA before activation; step-up for break-glass.
- Fleet Admin: require MFA before public launch if the provider makes it practical;
  otherwise document the risk and add it in Phase 4.
- Recovery: backup codes plus a second platform admin approval; audited.
- Do not allow SMS as the only factor for Super Admin.

## 5. Invitations and account lifecycle

Preferred flow:

1. Fleet Admin enters email + role.
2. API checks authority and duplicate membership.
3. Provider sends a single-use invitation link (7-day expiry).
4. Invitee sets a password (or uses passwordless), verifies email, accepts.
5. API creates/activates `fleet_memberships` and writes audit events.
6. Fleet Admin sees status `invited` → `active`; can resend or revoke.

Avoid:

- typing a temporary password into the admin UI;
- sending passwords in email or chat;
- auto-confirming email for invited users without verification;
- creating a fleet for every invited user (the current trigger does this before the
  Edge Function moves the profile — `supabase/schema.sql:354-388`).

If the provider cannot manage invitations, the API issues a signed, single-use token
with a short expiry and sends it via the selected email provider. The token is hashed
at rest and audited.

## 6. Sessions and revocation

- Access token lifetime: 10–15 minutes.
- Refresh token rotation; reuse detection where supported.
- Revoke all sessions on: password change, MFA reset, role change, suspension,
  removal, ownership transfer, suspected compromise.
- The API checks membership status on every request, so a still-valid access token
  cannot act after removal.
- Provide "Sign out of all devices" in settings.

## 7. Migration from Supabase Auth

### 7.1 Identity inventory

- Count auth users, confirmed/unconfirmed, last sign-in, providers used.
- Match `auth.users.email` to `profiles.email`; flag duplicates and mismatches.
- Identify accounts with no profile, no fleet, or multiple profiles (should not
  exist).
- Identify admin-created accounts with temporary passwords that were never changed.

### 7.2 Password migration options

1. **Hash import** — some providers can import bcrypt hashes. Confirm support for the
   exact Supabase hash format during the spike. If supported, users keep passwords.
2. **Forced reset** — if import is unsupported, mark accounts `must_reset_password`,
   notify users ahead of cutover, and require a reset on first sign-in. Provide a
   support path for locked-out users.
3. **Hybrid** — import where possible; force reset for accounts that fail import.

Do not export password hashes to spreadsheets, logs, or client devices. Use a
controlled, encrypted transfer and delete temporary files after import.

### 7.3 Cutover

- Freeze account creation during the final migration window.
- Create users in the new IdP with the same verified email and a stable external ID.
- Link `users.idp_subject` to the migrated profile.
- Disable Supabase sign-in after the new API is live; keep a read-only fallback for
  support during the agreed window.
- Communicate the change at least 7 days ahead, with a reminder and a support
  contact.

## 8. Spike plan (one week)

| Day | Task | Output |
|---|---|---|
| 1 | Confirm must-haves against two providers; get quotes and DPAs | Shortlist + cost |
| 2 | Create tenant, configure email/password, verification, reset | Working sign-in |
| 3 | Invite flow, role assignment, suspend/revoke via admin API | Lifecycle demo |
| 4 | MFA enrolment + step-up; recovery codes | MFA demo |
| 5 | JWT verification with JWKS in a stub API; test expiry/rotation | Token validation notes |
| 6 | Password-hash import or forced-reset rehearsal with test accounts | Migration decision |
| 7 | Write the recommendation, risks, and cost at 10× scale | Signed D-02 |

### Spike exit criteria

- Sign-up, sign-in, reset, invitation, suspend, and revoke all work end-to-end.
- MFA can be required for a platform admin and stepped up.
- The API can verify a token without a shared secret and reject expired/wrong-audience
  tokens.
- A test user can be migrated or forced through a reset without losing fleet access.
- The provider's region, DPA, and pricing are acceptable.

## 9. Consequences

Positive:

- Removes bespoke auth and the service-role Edge Function from the critical path.
- Gives MFA, invitations, and revocation without building them.
- Establishes a clean identity boundary for the API and RLS.

Costs and risks:

- Vendor cost and lock-in.
- Migration effort, especially password resets.
- Two systems (IdP + membership DB) must stay consistent via webhooks and
  reconciliation.
- Provider outages become an availability dependency; document the fallback.

## 10. Decision requested

1. Approve the must-have list in §2.
2. Approve a one-week spike with two shortlisted providers.
3. Choose the preferred provider, or authorise the interim "Supabase Auth until
   launch" fallback.
4. Confirm whether Fleet Admins must use MFA at launch or later.
5. Confirm the password migration approach if hash import is unavailable (forced
   reset is the default).
6. Confirm the identity data region and whether a DPA is required.

## 11. Sign-off

| Item | Decision | Date | Notes |
|---|---|---|---|
| Provider | | | |
| Spike result | | | |
| MFA policy | | | |
| Password migration | | | |
| Region/DPA | | | |
