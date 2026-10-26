# Phase 0 decision register

> **Superseded for the current app:** Supabase was removed from the active PWA on
> 25 October 2026. The client now stores data locally in IndexedDB. The documents
> below are historical proposals for a future hosted backend; they do not authorize
> restoring Supabase. Any shared backend/provider choice requires a new owner decision.

**Status:** In progress — PRD v0.3 reconciliation drafted 25 October 2026; the
membership model and vehicle permissions are approved, all new v0.3 role/data
details remain proposed
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Purpose:** Close the open decisions in PRD §16 before Phase 1 implementation.

These documents are proposals, not accepted decisions. Each records the context,
the options considered, a recommendation, the consequences, and the exact sign-off
needed. Change a document's status to **Accepted** only after the owner signs it.

**PRD v0.3 reconciliation:** D-01 and D-04 now capture the Fleet Owner, Finance
Manager, developer Super Admin, owner-entered driver activity, and the
vehicle/maintenance/finance records. Those additions are marked **Proposed**; the
reconciliation itself is not an approval.

## Decision index

| ID | Decision | Covers PRD §16 item | Needed by | Status |
|---|---|---|---|---|
| [D-01](0001-roles-and-membership.md) | Roles, permissions, membership, ownership, Super Admin boundaries | Role matrix; Fleet Owner; Finance Manager; Fleet Manager/Member actions; developer Super Admin access; owner-entered driver activity; legacy mapping | Phase 0 exit | Partially accepted — membership model and vehicle permissions approved; PRD v0.3 roles proposed |
| [D-02](0002-identity-provider.md) | Identity provider and session/claim model | Which identity provider supports a future hosted app (Supabase excluded) | Future hosted backend | Proposed |
| [D-03](0003-backend-runtime-and-hosting.md) | API/worker runtime, Docker, hosting, scheduler, realtime, observability | Hosting provider; Docker operations | Phase 1 start | Proposed |
| [D-04](0004-target-data-model-and-migration.md) | Target schema, RLS context, audit, retention, local-to-hosted migration | Target schema; operational and financial records; retention; RLS; migration | Future hosted backend | Partially accepted — membership constraint approved; vehicle rule incorporated; PRD v0.3 tables proposed |
| [D-05](0005-scale-environments-and-slo.md) | Expected scale, SLOs, environments, capacity, load tests | Fleet/user/concurrency numbers; performance targets | Phase 1 start | Proposed |
| [D-06](0006-client-scope-and-distribution.md) | PWA retention, Flutter distribution, offline scope, notifications channels, accessibility, support/error UX | PWA decision; mobile distribution; push/email; support contact | Phase 0 (scope) / Phase 2 | Proposed |

## Critical path

```
D-01 roles ──┐
D-02 identity ──┼──> D-04 schema/RLS ──> Phase 1 API ──> Phase 2 Flutter
D-05 scale ──┘                          │
D-03 hosting ──────────────────────────┘
D-06 client scope ─────────────────────────> Phase 2/3
```

D-01, D-02, and D-04 are the long poles. Start the identity spike immediately after
D-01 is signed; do not wait for the schema.

## Decision process

1. **Proposed** — engineering has written the options and a recommendation.
2. **Owner review** — product owner answers the "Decision requested" section.
3. **Accepted** — owner records the choice, date, and any amendments at the bottom
   of the document. Engineering updates the PRD and the relevant plan.
4. **Partially accepted** — a sub-decision is approved but the document remains open
   for the rest. Record the approved item and date; do not close the document.
5. **Superseded** — a later decision replaces it; link the replacement.

Decisions that change scope (D-01, D-06) require product-owner sign-off. Decisions
that change security or data handling (D-02, D-04) additionally require a security
review before Phase 1 code merges.

## Phase 0 exit criteria

Phase 0 is complete when all of the following are true:

- [ ] D-01 accepted: role names, capability matrix, legacy mapping, membership model,
      fleet ownership, Fleet Owner, Finance Manager, developer Super Admin access,
      driver activity, and Super Admin elevated-support policy.
      *(Membership model and vehicle permissions approved 25 October 2026; PRD v0.3
      additions remain proposed.)*
- [ ] D-02 accepted: identity provider selected; spike passed for MFA, invitations,
      password reset, JWKS, session revocation, and migration/import path.
- [ ] D-03 accepted: API/worker host, region, scheduler, realtime approach, secrets,
      observability, and rollback approach.
- [ ] D-04 accepted: target schema (including drivers, hires, maintenance, and
      finance), permission/RLS design, audit schema, retention, migration inventory,
      reconciliation, and rollback rehearsal plan.
- [ ] D-05 accepted: fleet/user/vehicle/concurrency assumptions, SLOs, RPO/RTO,
      environments, and load-test thresholds.
- [ ] D-06 accepted: PWA retention, Flutter distribution path, min OS versions,
      offline read decision, notification channels, accessibility target, support
      contact, and error catalog ownership.
- [ ] Security review scheduled (threat model before Phase 1; penetration test before
      public launch).
- [ ] Phase 1 owners, estimates, and dates recorded.
- [ ] PRD updated to the next version with the accepted decisions and measurable
      targets. *(Current PRD is v0.3; decisions still need reconciliation into a
      signed version.)*

## Default recommendation summary

If the owner wants a single starting position:

| Area | Recommendation |
|---|---|
| Roles | Fleet Owner, Fleet Admin, Fleet Manager, Finance Manager, Fleet Member, Read-only Member; Super Admin separate |
| Vehicle writes | **Approved 25 Oct 2026:** Fleet Members add/edit; Fleet Managers and Fleet Admins delete/restore; Read-only none. Fleet Owner full access is proposed. |
| Membership | **Approved 25 Oct 2026:** one active fleet per user in v1; `fleet_memberships` table designed for more later |
| Legacy mapping | **Proposed:** earliest `admin` → Fleet Owner; remaining `admin` → Fleet Admin; `member` → Fleet Member (create/update, no delete) |
| Super Admin | **Proposed:** separate MFA-protected developer account; audited cross-fleet read; no default writes; elevated actions separately granted |
| Driver activity | **Proposed:** Fleet Owner or authorized manager enters driver records, assignments, hires, mileage, and activity; no driver login in v1 |
| Operational records | **Proposed:** drivers, assignments, hires, odometer, fuel, maintenance, availability blocks |
| Finance records | **Proposed:** income, expenses/receipts, driver ledger, remittances, settlements; exact accounting rules open |
| Identity | Managed OIDC provider with MFA and invitations; run a one-week spike |
| Runtime | TypeScript Fastify API + worker in Docker; Neon Postgres |
| Hosting | Render or Cloud Run in the region nearest Neon; managed secrets and cron/jobs |
| Scheduler | Worker/scheduled job with advisory lock; do not rely on `pg_cron` |
| Realtime | Poll/revalidate on focus for v1; SSE only if metrics justify it |
| Membership data | `fleet_memberships`; `fleet_id NOT NULL` + FK everywhere; no user-delete cascade |
| Audit | Append-only `audit_events`; 24-month retention |
| Scale | 100 fleets, 10 users/fleet, 10k vehicles, 50 concurrent; validate at 2× |
| Mobile | Internal testing first; Android 8+/iOS 15+; read-only offline cache |
| Notifications | In-app only in v1; email/push later |
| PWA | Keep during transition; feature freeze at Flutter beta; sunset after acceptance |
| Errors | Central catalog with stable codes, plain language, correlation ID, support contact |

## Approved decisions

| Date | Decision | Detail | Recorded in |
|---|---|---|---|
| 2026-10-25 | D-01 membership model | v1 allows **one active fleet membership per user**. Historical/suspended/removed memberships remain as rows; a partial unique index enforces one active membership. Expanding to multi-fleet later means dropping the index and adding explicit active-fleet selection, not rewriting the table. | D-01 §5.4; D-04 §3.3 |
| 2026-10-25 | D-01 vehicle permissions | Fleet Members may **add/edit but not delete or restore**. Fleet Managers and Fleet Admins may create, edit, delete, and restore. `member_can_write` may restrict member create/edit but cannot grant delete; member delete is not a policy option in v1. | D-01 §3.6, §3.9, §4; D-04 §6.2 |

Partial approvals do not close a decision document. D-01 and D-04 remain open until
their other items are signed.

## Sign-off record

| Decision | Choice | Owner | Date | Notes |
|---|---|---|---|---|
| D-01 | Membership model: one active fleet per user in v1; expandable later | Najma Mustafa | 2026-10-25 | Partial approval; role names, remaining capability matrix, legacy mapping, ownership, and Super Admin policy remain pending |
| D-01 | Vehicle permissions: Members add/edit, no delete/restore; Managers/Admins delete | Najma Mustafa | 2026-10-25 | Partial approval; other capability-matrix rows remain pending |
| D-01 | Fleet Owner, Finance Manager, developer Super Admin, driver activity | | | Proposed by PRD v0.3 reconciliation; awaiting decision |
| D-04 | Operational and financial data model | | | Proposed by PRD v0.3 reconciliation; awaiting decision |
| D-02 | | | | |
| D-03 | | | | |
| D-04 | | | | |
| D-05 | | | | |
| D-06 | | | | |
