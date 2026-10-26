# PRD review — IP Motors Fleet Manager v0.1

**Reviewed:** 25 October 2026
**Reviewer:** Engineering review for the product owner
**Source:** [`docs/PRD.md`](../PRD.md) (v0.1, 22 October 2026)
**Scope:** Document review only. No application code was changed.

> **Historical note (25 October 2026):** This review assessed PRD v0.1. The PRD is
> now v0.3, which adds the Fleet Owner, Finance Manager, developer Super Admin,
> owner-entered driver activity, and vehicle/maintenance/finance records. Those
> additions are reconciled as **Proposed** in D-01, D-04, and the decision register;
> where this review differs, the v0.3 decision documents take precedence. This note
> does not mark any new item approved.

## Verdict

This is a strong, unusually clear first draft. The scope, non-goals, tenant-isolation
rules, human-readable error requirement, and phased delivery are all in the right
shape. It is good enough to guide Phase 0.

It is **not yet specific enough to guide implementation**. Eight decisions are
architectural blockers, several acceptance criteria cannot be measured as written,
and a few statements conflict with each other. Recommend:

1. Accept v0.1 as the working draft with the amendments below.
2. Treat the decision register in [`docs/decisions/README.md`](../decisions/README.md)
   as the Phase 0 gate.
3. Do not start Phase 1 schema/API work until D-01 (roles), D-02 (identity),
   D-04 (data model), and D-05 (scale/SLO) are signed off.

## What is strong

- Clear separation of platform scope and fleet scope.
- Explicit statement that hiding UI is not authorization, and that RLS is defense
  in depth rather than the only control.
- Good non-goals: no telematics, no silent offline overwrites, no unselected
  push/email providers.
- Human-readable message table with practical examples.
- Explicit warning that `supabase/schema.sql` is an upgrade script and must not
  be replayed blindly as a fresh migration.
- Acceptance criteria that are mostly outcome-based rather than feature lists.
- Sensible phasing that does not retire the PWA before Flutter passes acceptance.

## Blocking findings

These must be resolved before the target schema and API are designed.

| ID | Finding | Why it blocks implementation | Proposed resolution | Gate |
|---|---|---|---|---|
| PR-01 | **Membership model is ambiguous.** §6 says each role has "One fleet" scope, §7.1 says "A member can belong to a fleet", and §2 says the product must support multiple fleets. It never says whether one user may belong to several fleets in v1. | Determines the schema (`profiles.fleet_id` vs `fleet_memberships`), JWT/session context, invitation flow, and every query. | **Resolved 25 October 2026:** v1 supports one **active** membership per user; `fleet_memberships` stores historical rows and supports multi-fleet later without a rewrite. See D-01 §5.4. | Phase 0 |
| PR-02 | **The Fleet Manager / Fleet Member permission matrix is missing.** §6 leaves it "to be confirmed"; §16 repeats it as open. | Cannot write API authorization, RLS policies, UI gating, or migration mappings without it. | **Partially resolved 25 October 2026:** vehicle permissions approved — Fleet Members add/edit but not delete/restore; Fleet Managers and Fleet Admins delete. Remaining matrix rows (exports, member management, settings) are still open. See D-01 §4. | Phase 0 |
| PR-03 | **Legacy role mapping is unspecified.** §6 says `admin`/`member` should map "without elevating anyone", but does not say whether today's `member` becomes Fleet Member or Read-only Member. | Today's members can create, edit, and delete vehicles. Mapping them to Read-only would remove write access; mapping them to Fleet Member preserves create/edit (delete is intentionally removed). This is a product and migration decision, not an engineering guess. | Map `admin` → Fleet Admin and `member` → Fleet Member by default. Fleet Members keep create/edit/export but lose delete (approved 25 October 2026). No user becomes Super Admin. Fleet Admins may downgrade members to Read-only after migration. The mapping itself still needs sign-off. See D-01 §7. | Phase 0 |
| PR-04 | **Super Admin support access is not operable.** "Exceptional, justified, time-bound, audited" is the right principle, but there is no approval, duration, scope, tenant-notification, break-glass, or MFA-recovery design. "Inspect tenant metadata" is undefined. | Blocks the audit schema, platform-admin table, API endpoints, and security review. | Define a break-glass workflow: reason + ticket, step-up MFA, read-only content scope, ≤60 minutes, tenant admin notification, auto-expiry, immutable audit, no impersonation. Define the metadata field list. See D-01. | Phase 0 |
| PR-05 | **Identity provider selection has no criteria or deadline.** §9 says "choose an identity provider" but the PRD does not define requirements, a spike, or a decision date. | It is the critical path for Phase 1. It also determines how invitations, MFA, password reset, and JWT claims work. | Run a one-week spike against the criteria in D-02; prefer a managed OIDC provider with MFA and invitations. Do not build custom auth. | Phase 0 |
| PR-06 | **The RLS execution model is not specified.** "Where supported by the chosen connection/runtime model" acknowledges the risk but does not resolve it. With pooled connections, the API must set tenant context per transaction and must not connect as the table owner. | If the API connects as owner or sets context incorrectly, RLS silently stops protecting anything. | Connect as a non-owner `app_rw` role, `FORCE ROW LEVEL SECURITY`, `SET LOCAL app.user_id/app.fleet_id/app.role` at the start of each transaction, short transactions, and tenant-isolation tests. See D-03 and D-04. | Phase 0/1 |
| PR-07 | **Scheduler and realtime have no target design.** §7.5 says "managed scheduler or separately deployed worker", but the current product depends on Supabase `pg_cron` and Supabase Realtime. Neon provides neither as a drop-in. | Alert generation and live refresh are existing features; losing them is a parity failure. | Choose an external scheduler/worker with advisory locks and idempotent jobs. For v1 realtime, choose polling/revalidate-on-focus or SSE; do not assume WebSockets. See D-03. | Phase 0/1 |
| PR-08 | **Notification semantics conflict.** §7.5 says alerts are "generated once per user/source/state", but also that they update as the date approaches and are cleared on renewal. Read state must survive message refresh. | Different interpretations produce duplicate rows, lost read state, or alerts that never clear. | Define one row per `(user, source, state)` with upsert-on-message-change and delete-on-resolve; state transitions (`soon` → `expired`) replace the row. Add acceptance tests. See D-04. | Phase 0 |

## Ambiguities and contradictions

| ID | Where | Issue | Recommendation |
|---|---|---|---|
| PR-09 | §7.1 vs §13 | "A new fleet is created through an approved onboarding flow" vs "A new fleet admin can create a fleet without assistance". Who approves, and is self-service signup still allowed? | Define onboarding as: request → approval (manual or domain allowlist) → fleet created → first user is Fleet Admin. If self-service is retained, say so and add abuse controls. |
| PR-10 | §6 vs §7.2 | "Fleet Manager ... cannot assign admin roles unless explicitly granted" — granted by whom, recorded where? | Treat it as a fleet policy flag owned by the Fleet Admin, recorded in the audit log. Default: Fleet Managers may invite Member/Read-only only. |
| PR-11 | §7.4 | "date/status summaries" has no date basis (registration date, document expiry, service date), timezone, or export column definition. | Specify fields and timezone in D-04/D-06. Reports should state the date field in the UI. |
| PR-12 | §7.3/§7.4 | "Up-to-date" is undefined when a document date is missing. Current code treats missing dates as active. | Define: missing date = "not tracked", counted separately from up-to-date; overdue > due soon > valid > not tracked. |
| PR-13 | §7.6 vs §5 | Offline read is "may be added", but Flutter architecture needs a yes/no before Phase 2. | Decide in D-06: recommend read-only cache with "last updated" and disabled writes, or explicitly no offline data in v1. |
| PR-14 | §12 | p95 < 500 ms has no measurement point, dataset size, or concurrency. Client-side includes mobile network latency. | Define server-side p95 at the API, at an agreed dataset and load profile; report separately from end-to-end. See D-05. |
| PR-15 | §10/§11 | No uptime SLO, RPO, RTO, backup retention, or incident severity model. | Add SLOs and recovery targets in D-05. |
| PR-16 | §12 | No WCAG level, minimum Android/iOS versions, or device matrix. | Target WCAG 2.2 AA, Android 8+ (API 26), iOS 15+; document the test matrix in D-06. |
| PR-17 | §8/§12 | "Keep message strings centralized" but no message catalog, error-code scheme, or correlation-ID format. | Define an error envelope and catalog (code → user message + next step + support reference). See D-06. |
| PR-18 | §11 | "Immutable audit trail" has no schema, retention, export, or tamper-evidence rules. | Append-only `audit_events`, no update/delete grants, retention period, and an audited export path. See D-04. |
| PR-19 | §11 | Retention/deletion and privacy jurisdiction are unspecified, and account deletion conflicts with shared vehicle ownership. | Define retention, soft-delete for vehicles, ownership transfer, and what happens to records created by a removed member. See D-04. |
| PR-20 | §9/§10 | No API versioning or client-compatibility policy, even though installed mobile apps cannot be force-updated. | Version the API (`/v1`), support the previous mobile version for a defined window, and publish a deprecation policy. |
| PR-21 | §14 | Phases have no exit criteria, dependencies, owners, or estimates. | Add a Phase 0 exit checklist and a RACI. See the decision register. |
| PR-22 | §13 | Success measures have no sample size, method, or threshold. | Define: usability test with 5 new admins, ≥4/5 complete create-fleet + add-vehicle unaided; security tests must pass 100% of cross-tenant cases. |
| PR-23 | §11/§14 | "Conduct a security review" has no scope, timing, or owner. | Schedule a threat-model review before Phase 1 and an external penetration test before public launch. |
| PR-24 | §10 | Docker is described as packaging only (correct), but hosting selection is not tied to Neon region, private networking, or secret management. | Choose a host with a region close to Neon, health checks, managed secrets, cron/jobs, and rollback. See D-03. |
| PR-25 | §3 | The PWA "may remain available" but there is no feature-freeze, dual-write, or data-divergence plan during the transition. | Freeze PWA features after Flutter beta; both clients use the same API; no dual writes to separate schemas. See D-06. |
| PR-26 | §7.1 | Invitation vs admin-created password is not decided. Today an admin types a temporary password. | Prefer provider-managed invitations with single-use links and no plaintext password sharing. See D-02. |
| PR-27 | §8/§12 | No idempotency strategy for "partial/unknown result", and no retry guidance for writes. | Require `Idempotency-Key` on create/update endpoints; return the original result on retry; never auto-retry non-idempotent writes. |
| PR-28 | §6 | Last-admin protection covers demotion, but not account deletion, suspension, or fleet ownership transfer. | Add a transfer-ownership flow and block deletion/suspension of the last active Fleet Admin. |
| PR-29 | §7.2 | "Core settings" is undefined beyond the fleet name. | List v1 settings: name, timezone, alert defaults, member policy, export policy. |
| PR-30 | §9 | The source inventory for migration is not listed (tables, row counts, storage objects, auth users, edge functions, cron jobs). | Produce a migration inventory and reconciliation plan before Phase 1. See D-04. |

## Missing measurable targets

Add these to §12/§13 before Phase 1:

| Area | Proposed target (for sign-off) |
|---|---|
| API read latency | Server-side p95 < 500 ms for a 1,000-vehicle fleet at 20 req/s; p99 < 1,000 ms |
| API write latency | Server-side p95 < 800 ms; no write over 5 s without a timeout response |
| Availability | 99.5% monthly for the API; planned maintenance excluded |
| Error rate | < 1% 5xx over a rolling 15 minutes; alert at 2% for 5 minutes |
| Recovery | RPO ≤ 15 minutes (Neon PITR); RTO ≤ 4 hours; quarterly restore rehearsal |
| Alert job | ≥ 99% of scheduled runs succeed; a missed run alerts within 30 minutes |
| Tenant isolation | 100% of cross-fleet read/write/export tests denied; zero exceptions in CI |
| Accessibility | WCAG 2.2 AA for core flows; screen-reader pass on sign-in, dashboard, vehicle list/detail, add/edit |
| Compatibility | Android 8+ / iOS 15+; test matrix of 2 small, 2 large, 1 tablet |
| Usability | 5 new admins; ≥ 4/5 create a fleet and add a vehicle unaided |
| Migration | 100% row-count reconciliation; 0 unexplained ownership gaps; restore rehearsal passed |

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Gate |
|---|---|---|---|---|---|
| R-01 | Identity migration locks users out (password hashes cannot be imported) | Medium | High | Confirm provider import support during the spike; otherwise plan forced reset with notice, support desk, and a staged rollout | Phase 0 |
| R-02 | Legacy role mapping changes privileges silently | Medium | High | Explicit mapping signed by owner; automated before/after permission diff; no Super Admin grants | Phase 0 |
| R-03 | Cross-tenant leak through RLS bypass or missing foreign keys | Medium | Critical | Non-owner DB role, `FORCE RLS`, `NOT NULL` + FK on every tenant column, adversarial tests in CI | Phase 1 |
| R-04 | Deleting a member deletes shared fleet vehicles | High (current schema) | Critical | Remove `auth.users` cascade from `vehicles.user_id`; use `SET NULL`/`RESTRICT`; soft-delete vehicles; transfer ownership | Phase 1 |
| R-05 | Alerts stop because `pg_cron` is unavailable on Neon | High | High | External scheduler/worker with advisory lock, idempotent upserts, heartbeat monitoring | Phase 1 |
| R-06 | Scope creep across Flutter, API, and migration delays everything | High | High | Phase gates; thin v1; PWA feature freeze during Flutter build | Phase 0 |
| R-07 | Realtime parity gap degrades the shared-fleet experience | Medium | Medium | Poll/revalidate on focus in v1; add SSE only if metrics justify it | Phase 1/2 |
| R-08 | Status/report numbers disagree between screens | High (current code) | Medium | One server-side status service; one timezone rule; contract tests | Phase 1 |
| R-09 | Migration rollback is not rehearsed | Medium | High | Snapshot + PITR, staging rehearsal with production-shaped data, freeze window, documented restore | Phase 3 |
| R-10 | Store rejection or accessibility failure delays distribution | Medium | Medium | Internal testing first; accessibility checklist; privacy labels | Phase 3 |
| R-11 | Managed auth/hosting costs exceed budget at scale | Medium | Medium | Price at 10× expected scale; budget cap; usage alerts | Phase 0 |
| R-12 | Super Admin support access is abused | Low | Critical | Break-glass controls, tenant notification, immutable audit, quarterly review | Phase 0 |
| R-13 | Legacy duplicates or invalid dates break constraints | High | Medium | Inventory and cleanup scripts; dry-run; fail-closed unique index | Phase 1/3 |
| R-14 | The insecure current app stays live during a long transition | High | High | Freeze features, restrict signup, or set a firm PWA sunset date after Flutter acceptance | Phase 0 |

## Recommended edits to the PRD

1. **Add a "Decisions" section** that links to the decision register, with owner,
   date, and status for each open item.
2. **Replace "role names and permissions to be confirmed"** with the signed matrix
   (D-01), or mark the section as provisional and link to it. Vehicle permissions are
   signed as of 25 October 2026; the remaining rows are provisional.
3. **Define membership** (**approved 25 October 2026**): one active fleet per user
   in v1, schema ready for more.
4. **Define derived status**: timezone, missing-date handling, precedence, and the
   difference between document-level and vehicle-level counts.
5. **Define notification lifecycle** with states, read-state preservation, and
   dedupe keys.
6. **Define onboarding**: who approves a new fleet, and whether self-service signup
   remains.
7. **Add non-functional targets** from the table above, including SLO/RPO/RTO.
8. **Add API versioning and mobile compatibility** requirements.
9. **Add a message/error catalog** requirement with a correlation-ID format and a
   support contact.
10. **Add Phase 0 exit criteria** and a RACI.
11. **Add a migration inventory** and a rollback rehearsal requirement.
12. **Resolve the PWA transition plan** with a feature freeze and sunset trigger.

## Questions for the product owner

1. ~~Does v1 allow one user to belong to more than one fleet? If yes, how is the
   active fleet chosen?~~ **Answered 25 October 2026:** one active membership per
   user in v1; multi-fleet is a later expansion.
2. ~~What exactly may a Fleet Member do: add only, add/edit, or full vehicle CRUD?~~
   **Answered 25 October 2026:** add/edit, but not delete or restore. Fleet Managers
   and Fleet Admins may delete and restore. Other actions (export, invites) remain
   open.
3. Does a Fleet Manager manage non-admin members, or only vehicles and reports?
4. Who owns a fleet, and how is ownership transferred?
5. Is fleet creation self-service or approved? Who approves?
6. Which identity provider is preferred, and what is the decision deadline?
7. Is realtime refresh required in Flutter v1, or is refresh-on-focus enough?
8. Is offline **read** required in v1? (Offline writes are out of scope.)
9. What are the expected fleet count, users per fleet, vehicles per fleet, and peak
   concurrency?
10. What support contact and response commitment should appear in errors?

## Review conclusion

Approve v0.1 as the product baseline, with the understanding that Phase 0 is not
complete until the decision register is signed. The largest risks are not feature
gaps; they are (a) identity and membership decisions, (b) tenant-safe RLS under a
pooled API, (c) the destructive cascade from user deletion to shared vehicles, and
(d) a migration path that can be restored. Those should be resolved before any
Flutter or API implementation begins.
