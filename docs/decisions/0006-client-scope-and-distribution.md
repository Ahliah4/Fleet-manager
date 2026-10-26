# D-06 — Client scope, PWA transition, Flutter distribution, and support UX

**Status:** Proposed — awaiting product-owner sign-off
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD §3, §7.6, §8, §12, §13, §16 (PWA retention, mobile distribution,
push/email, support contact, onboarding mechanism)
**Depends on:** D-01 (roles), D-02 (identity), D-04 (data/status rules)
**Blocks:** Phase 2 Flutter scope, Phase 3 launch

## 1. Context

The current client is a React + Vite PWA. It is responsive, installable, and has an
offline app shell, but it does not cache fleet data and has no native distribution
pipeline. The target is a mobile-first Flutter app for Android and iOS. The PRD
leaves several client decisions open: whether the PWA survives, how Flutter is
distributed, whether offline read is in v1, which notification channels are in
scope, what support contact appears in errors, and what accessibility level is
required.

This decision defines the v1 client scope and the transition rules.

## 2. v1 client scope

### 2.1 In scope

| Flow | Required screens | Notes |
|---|---|---|
| Authentication | Sign in, forgot password, reset password, invite acceptance | Provider-hosted or native; MFA challenge for admins |
| Onboarding | Fleet request/approval status, first-run setup | See §3 |
| Dashboard | Totals, due soon, expired, not tracked, up to date, fleet health, needs attention | Counts open filtered lists |
| Vehicles | List, search, filter, sort, pagination | Pull-to-refresh; no unbounded list |
| Vehicle detail | Core fields, four document dates, status per document, notes, history (audit-based) | Edit/delete gated by role |
| Add/edit vehicle | Validated form, duplicate-registration message, save outcome | Keyboard and date-picker behavior on small screens |
| Notifications | List, unread filter, mark read, mark all read, preferences | In-app only in v1 |
| Team | Member list, role, status, invite, change role, suspend/remove | Admin/manager per D-01 |
| Settings | Profile, password reset, fleet name/timezone/policy, notification prefs, sign out all devices | Fleet settings admin-only |
| Reports | Status summary, date-range summary, export CSV, print/share PDF | Exports audited server-side |
| Support | Contact support, support reference display | See §7 |

### 2.2 Out of scope for v1

- Push and email delivery.
- Offline writes and conflict resolution.
- Telematics, GPS, fuel cards, maintenance purchasing.
- Public store launch (internal testing first; public is a later release decision).
- Social login, SSO/SAML.
- Multiple active fleets per user (schema ready, UI not).

## 3. Onboarding and fleet creation

PRD §7.1 requires an approved onboarding flow; §13 says a new admin should create a
fleet without assistance. These are compatible if "without assistance" means no
manual hand-holding, not no approval.

### Recommended v1 flow

1. Public **Request access** form: name, work email, fleet name, country/timezone,
   expected vehicle count.
2. Email verification.
3. Platform admin approves or declines (audited). Approval creates a `pending` fleet
   and sends an invitation to the requester.
4. Requester accepts, sets a password, becomes Fleet Admin and owner.
5. The fleet becomes `active` on first sign-in (or on approval, per owner choice).
6. The admin invites the rest of the team.

### Alternatives

- **Invite-only** — no public request; the operator creates fleets manually. Lowest
  abuse risk, least scalable.
- **Self-service with pending status** — instant fleet creation, limited until
  approved, rate-limited and email-verified. Fastest, highest abuse risk.
- **Domain allowlist** — auto-approve verified emails from approved domains.
  Suitable only for a single organisation.

**Recommendation:** request + approval for v1. If the owner wants instant
self-service, use the pending-status variant and add abuse controls before launch.

Disable the current open Supabase sign-up at cutover. Today every signup becomes an
admin of a new fleet (`supabase/schema.sql:354-388`), which is not the target model.

## 4. PWA transition

### Recommendation

Keep the React PWA available during the transition, but **freeze features** once the
Flutter beta starts. Do not maintain two feature roadmaps.

Rules:

- Both clients use the same API and the same authorization model.
- No dual-write to separate schemas; one source of truth.
- The PWA gets security fixes and critical bug fixes only after the freeze.
- Announce the transition at least 30 days before any retirement.
- Retire the PWA only after:
  - Flutter passes the v1 acceptance checks on the agreed device matrix;
  - the production data migration is verified;
  - users have a documented migration path and support contact;
  - a read-only PWA fallback window (for example 30 days) has completed.
- If the PWA is retained long-term, it needs the same accessibility, error, and
  security standards; do not treat it as a second-class client.

## 5. Mobile distribution

### Recommended path

1. **Internal testing** — Android internal track (AAB) and iOS TestFlight, limited to
   the project team and a small pilot fleet.
2. **Private pilot** — invite-only testers, 2–4 weeks, monitored support.
3. **Public stores** — only after acceptance, privacy policy, store listings, and
   crash-free targets are met.

### Minimum versions (proposed)

- Android 8.0 (API 26) and above.
- iOS 15 and above.
- Phone-first; tablet layouts supported but not a separate design.
- Test matrix: small phone (≈360×640), large phone (≈430×932), tablet (≈768+),
  Android and iOS, light mode, 200% text scaling, screen reader.

### Store readiness

- Privacy policy, terms, data-deletion instructions, support URL.
- Account deletion flow (or a documented in-app request path).
- Correct permission usage (notifications only if push is added; camera only if
  document capture is added).
- App icons, screenshots, description, age rating, export compliance.
- Crash-free sessions ≥ 99.5% during the pilot.
- No secrets or debug menus in release builds.

## 6. Offline scope

PRD §5 forbids silent offline overwrites and allows offline reads only with clear
sync/conflict handling. For v1:

**Recommended:** read-only cache of the last successfully loaded dashboard, vehicle
list, vehicle detail, and notifications, with:

- a persistent "Showing data from {time}" banner when offline or stale;
- a manual refresh that fails with a plain-language message;
- all write actions disabled offline with an explanation;
- no queued writes and no background sync of edits;
- cache cleared on sign-out and when the account is removed;
- an option to disable caching on shared devices (future).

If the owner prefers to avoid the complexity, ship v1 with **no offline data** and
the current honest offline banner. Either choice must be explicit before Phase 2
architecture.

## 7. Error and support UX

### 7.1 Error envelope and message catalog

The API returns a stable `code`, optional `fieldErrors`, a `retryable` flag, and a
`supportReference`. The client maps codes to localized messages and next steps:

```
NETWORK_UNAVAILABLE → "We couldn't reach the server. Check your connection and try again."
SESSION_EXPIRED     → "Your session has expired. Sign in again to continue."
PERMISSION_DENIED   → "You don't have permission to change this vehicle. Ask a fleet admin for access."
SERVER_UNAVAILABLE  → "The service is temporarily unavailable. Your changes were not saved. Try again shortly."
UNKNOWN_RESULT      → "We couldn't confirm whether this change was saved. Refresh the record before retrying."
DUPLICATE_VEHICLE   → "A vehicle with this registration is already in this fleet."
```

Rules:

- Never show SQL, PostgREST codes, stack traces, tokens, hostnames, or raw server
  responses.
- Always state what happened, whether data was saved, and the next step.
- Log the technical detail with the correlation ID; show a short reference such as
  `FM-7K2Q9` with a copy button.
- Do not auto-retry writes unless the endpoint is idempotent and the client has an
  idempotency key.
- Never imply an offline edit was saved.

### 7.2 Support contact

Proposed:

- In-app **Help & support** entry with the support email and a short response target
  (for example one business day).
- Error cards include "Contact support" and the reference.
- A support runbook documents escalation, severity, and who is on call.
- Do not publish personal phone numbers or internal chat links.

The exact email address and hours are an open decision. Use a placeholder until
confirmed; do not ship a dead address.

## 8. Accessibility

Target **WCAG 2.2 AA** for core flows:

- Contrast ratios met in both light and dark themes (if dark ships).
- Dynamic type up to 200% without clipping or overlap.
- Touch targets at least 44×44 logical pixels.
- Screen-reader labels for every control; logical focus order; no keyboard traps.
- Charts have a text/table alternative and a summary sentence.
- Form errors are announced and linked to the field.
- Reduced-motion support; no essential information conveyed by colour alone.
- Test with TalkBack and VoiceOver on the device matrix.

## 9. Localisation

- English only in v1.
- All user-facing strings live in ARB files (Flutter) and one catalog for the API
  error messages; no inline strings in widgets.
- Use ICU message formatting for plurals/dates.
- Dates and numbers respect the fleet/user locale; expiry dates are date-only and
  displayed consistently.
- The API returns codes and parameters, not pre-formatted sentences, so the client
  can localize later.

## 10. Notifications channels

- **v1:** in-app only. Alerts are generated by the worker and shown in the app with
  per-user read state and preferences.
- **Later:** email and push are separate decisions requiring a provider, consent,
  unsubscribe, delivery logs, and cost approval.
- Candidate providers to evaluate later: FCM + APNs for push; Postmark, Resend, or
  Amazon SES for email.
- Do not show an enabled email toggle until delivery exists; the current UI correctly
  disables it (`src/Pages/settings.jsx:327-333`).

## 11. Analytics and privacy

- Minimal product analytics only: screen views, feature usage, crash reports. No
  vehicle notes, registrations, emails, or free-text content.
- Disclose analytics in the privacy policy; provide an opt-out if required by
  jurisdiction.
- Crash reports must scrub PII and secrets.
- Do not use third-party session recording in v1.

## 12. Acceptance checks for the client

- [ ] A permitted member can complete the main task on a small phone without desktop
      access.
- [ ] Every role sees only its permitted actions; the API denies the rest.
- [ ] No user-visible message contains a code, SQL fragment, hostname, or token.
- [ ] Loading, empty, offline, permission, and retry states exist for each core
      screen.
- [ ] Offline mode shows the last-refreshed time and disables writes.
- [ ] Screen-reader pass and 200% text scaling pass on the device matrix.
- [ ] CSV export is formula-safe, fleet-scoped, and audited.
- [ ] Sign-out clears cached data and tokens.
- [ ] Crash-free sessions ≥ 99.5% in the pilot.
- [ ] Store/privacy requirements are complete before public distribution.

## 13. Consequences

Positive:

- One client roadmap after the freeze; no permanent dual maintenance.
- Internal testing reduces store and quality risk.
- Offline read-only is honest and avoids conflict handling.
- A central error catalog fixes the current raw-error problem.
- Accessibility and localisation are designed in, not retrofitted.

Costs and risks:

- Approval-based onboarding adds operator work.
- Read-only caching adds state and test complexity; no offline data is simpler.
- Store review, privacy labels, and account deletion add launch work.
- Freezing the PWA may disappoint web-only users; communicate early.

## 14. Decision requested

1. Approve the v1 client scope in §2.
2. Approve the onboarding mechanism in §3 (recommend request + approval).
3. Approve the PWA transition and freeze/sunset rules in §4.
4. Approve the distribution path in §5 (internal → pilot → public).
5. Approve minimum Android 8 / iOS 15 and the device matrix.
6. Decide offline read: read-only cache with timestamp (recommended) or no offline
   data.
7. Approve in-app-only notifications for v1.
8. Approve WCAG 2.2 AA and the localisation approach.
9. Provide the support email, hours, and response target.
10. Approve the analytics/privacy stance.

## 15. Sign-off

| Item | Decision | Date | Notes |
|---|---|---|---|
| v1 scope | | | |
| Onboarding | | | |
| PWA transition | | | |
| Distribution | | | |
| OS/device matrix | | | |
| Offline read | | | |
| Notification channels | | | |
| Accessibility/localisation | | | |
| Support contact | | | |
| Analytics/privacy | | | |
