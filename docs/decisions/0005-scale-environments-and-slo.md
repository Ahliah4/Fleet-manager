# D-05 — Scale assumptions, SLOs, environments, and load testing

**Status:** Proposed — awaiting product-owner sign-off
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD §12, §13, §16 (fleet count, users per fleet, peak concurrency,
data retention, performance targets)
**Depends on:** D-01 (roles), D-03 (hosting), D-04 (schema)
**Blocks:** Phase 1 capacity choices, Phase 3 load testing

## 1. Context

The PRD says to "agree measurable targets after establishing a baseline" and to
establish expected fleets, users, concurrency, and growth before choosing instance
sizes. It gives one target: p95 API read under 500 ms. There is no baseline today:
the app queries Supabase directly, fetches full tables without pagination, and has
no metrics.

This decision proposes planning numbers, SLOs, environments, and a load-test profile
so capacity choices are explicit. The numbers are **placeholders for the owner to
confirm or replace**; they are not commitments.

## 2. Proposed planning assumptions

| Dimension | Proposed v1 planning value | 12-month design target | Notes |
|---|---|---|---|
| Active fleets | 25 | 100 | "Active" = at least one write in 30 days |
| Users per fleet | 3 (median), 10 (p95) | 20 (max) | Small teams |
| Total users | 100 | 1,000 | |
| Vehicles per fleet | 20 (median), 100 (p95) | 500 (max) | |
| Total vehicles | 1,000 | 10,000 | |
| Peak concurrent users | 15 | 50 | 10% of total users |
| API requests per active user per minute | 4 | 4 | Read-heavy |
| Peak API request rate | 5 req/s | 25 req/s | Test at 2× (50 req/s) |
| Write rate | 10% of requests | 10% | |
| Report exports | 20/day | 200/day | Synchronous in v1 |
| Notification rows per user per day | 10 | 20 | Generated in batches |
| Data growth | < 100 MB/month | < 1 GB/month | Includes audit |
| Retention | Per D-04 | Per D-04 | 24-month audit |

If the owner expects materially larger fleets (for example 1,000+ vehicles per
fleet), the dashboard/report queries and export design need to change before Phase 1.
Do not discover this at launch.

## 3. Service level objectives (proposed)

These are **server-side** measurements at the API, excluding mobile network time.
Report end-to-end mobile latency separately.

| SLO | Target | Measurement | Alert |
|---|---|---|---|
| API availability | 99.5% monthly | Successful responses / total, excluding planned maintenance | 5xx > 2% for 5 min |
| API read latency | p95 < 500 ms, p99 < 1,000 ms | Histogram by route | p95 > 1 s for 10 min |
| API write latency | p95 < 800 ms, p99 < 1,500 ms | Histogram by route | p95 > 1.5 s for 10 min |
| Dashboard load | p95 < 1,000 ms for 100 vehicles | Server + round trip | p95 > 2 s |
| Vehicle list | p95 < 700 ms for a 50-item page | Server | p95 > 1.5 s |
| Export | < 5 s for 1,000 vehicles | Server | Any export > 15 s |
| Notification job | < 60 s for 10k vehicles | Job duration | Missed heartbeat > 90 min |
| Job success | ≥ 99% of scheduled runs | `job_heartbeats` | 2 consecutive failures |
| Error rate | < 1% 5xx | Rolling 15 min | > 2% for 5 min |
| Recovery point (RPO) | ≤ 15 minutes | Neon PITR window | Monthly check |
| Recovery time (RTO) | ≤ 4 hours | Restore rehearsal | Quarterly test |
| Data durability | Provider guarantee + daily logical backup | Neon + export | Weekly verification |

Availability target rationale: 99.5% allows about 3.6 hours of downtime per month,
which is realistic for a small team without 24/7 operations. If the product sells
uptime commitments, raise this only after staffing and on-call are in place.

## 4. Capacity and connection budget

### 4.1 API instances

Start with 2 small instances behind the host's load balancer for redundancy and
zero-downtime deploys. Scale horizontally when CPU > 60% or p95 latency exceeds the
SLO for 10 minutes.

Do not scale by adding database connections blindly. The connection budget is:

```
max_connections_needed = api_instances × pool_max_per_instance
                       + worker_instances × pool_max_per_instance
                       + migration/support headroom
```

Example: 2 API × 10 + 1 worker × 5 + 10 headroom = 35 connections. Keep this below
the Neon plan limit and the pooler limit, with at least 30% headroom.

### 4.2 Pooling

- Use the Neon pooler for the API; direct connections for migrations.
- `pool_max` 10 per instance at v1; revisit with measured concurrency.
- Bound the wait queue; fail fast with a retryable error rather than timing out
  silently.
- Keep transactions short; never call the IdP or an email provider inside a DB
  transaction.

### 4.3 Query rules

- Every list endpoint is paginated (default 25, max 100).
- No `SELECT *` from the API; select explicit columns.
- Dashboard counts use aggregate queries, not "fetch all vehicles and count in
  JavaScript".
- Reports use indexed date/status filters and a maximum range.
- Exports are capped (for example 10,000 vehicles) and streamed; larger exports
  become an async job.
- Add indexes from D-04; verify with `EXPLAIN (ANALYZE, BUFFERS)` on production-shaped
  data.

## 5. Rate limits (proposed)

| Endpoint group | Limit | Scope |
|---|---|---|
| Sign-in / password reset | 5 per minute | IP + email |
| Invitations | 20 per hour | Fleet |
| General API reads | 120 per minute | User |
| General API writes | 30 per minute | User |
| Exports | 5 per hour | User |
| Support access requests | 3 per hour | Platform admin |

Return `429` with `Retry-After` and a plain-language message. Do not reveal whether
an email exists in password-reset responses.

## 6. Environments

| Environment | Purpose | Data | Access |
|---|---|---|---|
| Local | Development | Seed data with two fleets | Developer |
| Development | Shared integration | Synthetic data | Engineering |
| Staging | Pre-production, migration rehearsal | Anonymised production copy or synthetic at production shape | Engineering + product |
| Production | Live | Real data | Restricted; break-glass |

Rules:

- Separate Neon projects/branches, IdP tenants/applications, secrets, and API hosts.
- No production data in development. Staging uses anonymised data with a documented
  process; do not copy notes, emails, or registration numbers without masking.
- Separate credentials per environment; rotate on staff change.
- Feature flags for risky changes; staging must mirror production configuration.
- Migrations run in development → staging → production, never directly in production.

## 7. Load and recovery testing

### 7.1 Load profile

Use k6 (or equivalent) against staging with production-shaped data:

- Ramp 0 → 25 req/s over 5 minutes.
- Hold 25 req/s for 15 minutes.
- Spike to 50 req/s for 2 minutes.
- Ramp down.

Mix: 70% vehicle list/detail, 15% dashboard, 10% writes, 5% reports/exports.

### 7.2 Pass criteria

- p95 read < 500 ms, p99 < 1,000 ms at 25 req/s.
- p95 write < 800 ms.
- Error rate < 1%.
- No connection-pool exhaustion; DB connections < 80% of budget.
- No query over 2 s in the slow-query log.
- Notification job completes < 60 s at 10k vehicles.

### 7.3 Recovery testing

- Restore a Neon branch/snapshot into staging.
- Measure time to restore and verify row counts/checksums.
- Rehearse the migration rollback (D-04 §7.5).
- Rehearse loss of the IdP (can users still sign in? what is the fallback?).
- Rehearse a worker failure (alerts catch up on the next run without duplicates).

## 8. Cost model (outline)

Estimate monthly cost at v1 and 10× scale:

- Neon compute + storage + PITR.
- API/worker hosting (instances + egress).
- Identity provider (MAU pricing).
- Email provider (invitations/resets).
- Error tracking/observability.
- Domain/TLS (usually included).
- Support/on-call time.

Set a budget cap and usage alerts before launch. Managed auth can become the largest
variable cost at scale; confirm pricing in D-02.

## 9. Consequences

Positive:

- Capacity and SLOs are explicit and testable.
- Connection budgeting prevents a common serverless/pooling failure.
- Staging with production-shaped data catches migration and index problems early.
- Recovery targets are rehearsed, not assumed.

Costs and risks:

- The assumptions may be wrong; revisit after 30 days of production metrics.
- 99.5% still requires on-call and incident response.
- Load testing takes engineering time and a production-shaped dataset.
- Anonymisation adds work before staging can be useful.

## 10. Decision requested

1. Confirm or replace the planning assumptions in §2.
2. Approve the SLO table in §3, especially availability 99.5% and RPO/RTO.
3. Approve the initial instance/pool budget in §4.
4. Approve the rate limits in §5.
5. Approve the environment model and the staging data policy.
6. Approve the load profile and pass criteria.
7. Confirm who is on call and what the escalation path is.
8. Confirm the monthly budget cap.

## 11. Sign-off

| Item | Decision | Date | Notes |
|---|---|---|---|
| Scale assumptions | | | |
| SLOs | | | |
| Capacity/pooling | | | |
| Rate limits | | | |
| Environments | | | |
| Load/recovery tests | | | |
| On-call/budget | | | |
