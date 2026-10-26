# Documentation

Planning and review material for IP Motors Fleet Manager. The product requirements
remain in [`PRD.md`](PRD.md). The dated audit and decision files describe the former
cloud-backed implementation and should be treated as historical proposals, not as
instructions to restore that integration. The current PWA uses local IndexedDB.

## Read in this order

1. [`PRD.md`](PRD.md) — current product requirements v0.4.
2. [`reviews/prd-review-2026-10-25.md`](reviews/prd-review-2026-10-25.md) — gaps,
   contradictions, risks, and measurable-target proposals.
3. [`reviews/gap-analysis-2026-10-25.md`](reviews/gap-analysis-2026-10-25.md) — how
   the former React/cloud app mapped to the PRD, with file references.
4. [`decisions/README.md`](decisions/README.md) — decision register, critical path,
   and Phase 0 exit criteria.

## Decision documents

| ID | Topic | Status |
|---|---|---|
| [D-01](decisions/0001-roles-and-membership.md) | Roles, permissions, membership, Fleet Owner, Finance Manager, Super Admin | Partially accepted — membership model and vehicle permissions approved; PRD v0.3 roles proposed |
| [D-02](decisions/0002-identity-provider.md) | Identity provider and sessions | Proposed |
| [D-03](decisions/0003-backend-runtime-and-hosting.md) | API/worker, Docker, hosting, scheduler | Proposed |
| [D-04](decisions/0004-target-data-model-and-migration.md) | Schema, RLS, audit, operational and financial records, migration | Partially accepted — membership constraint approved; vehicle rule incorporated; PRD v0.3 tables proposed |
| [D-05](decisions/0005-scale-environments-and-slo.md) | Scale, SLOs, environments | Proposed |
| [D-06](decisions/0006-client-scope-and-distribution.md) | PWA, Flutter, offline, support UX | Proposed |

## Status legend

- **Proposed** — written for review; not yet approved.
- **Partially accepted** — one or more sub-decisions are approved, but the document
  remains open.
- **Accepted** — signed by the product owner; implementation may proceed.
- **Superseded** — replaced by a later decision.

None of the decision documents changes application code. Each ends with a
"Decision requested" and a sign-off table. Record the owner's choice and date there,
then update the PRD to the next signed version.
