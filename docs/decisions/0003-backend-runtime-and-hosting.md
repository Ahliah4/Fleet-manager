# D-03 — Backend runtime, Docker, hosting, scheduler, and observability

**Status:** Proposed — awaiting product-owner sign-off
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD §9, §10, §12, §16 (hosting provider)
**Depends on:** D-02 (identity), D-04 (schema/RLS), D-05 (scale)
**Blocks:** Phase 1 deployment

## 1. Context

The current app has no backend service: the React client calls Supabase directly
(`src/lib/supabaseClient.js`). The target architecture needs an API and a scheduled
worker, both packaged with Docker, talking to Neon PostgreSQL. Docker packages
processes; it does not provide scaling, high availability, or a scheduler by itself.
This decision defines the runtime shape and the host capabilities required.

## 2. Recommended architecture

```
Flutter (Android/iOS) ─┐
React PWA (transition) ─┼── HTTPS ──> API (stateless, Docker)
                        │               │
                        │               ├── Neon PostgreSQL (pooled)
                        │               ├── Identity provider (JWKS)
                        │               └── Audit / logs / metrics
                        │
                        └── Worker + scheduler (Docker) ──> Neon
```

- **API:** stateless HTTP service. No in-memory session state. Horizontally
  scalable. Handles auth, authorization, validation, queries, exports, and audit.
- **Worker:** scheduled and queued jobs (notifications, exports if async, cleanup).
  Idempotent and safe to retry.
- **Database:** Neon PostgreSQL, accessed through its pooler by the API and directly
  by migrations.
- **Clients:** Flutter and the PWA call only the API. Neither receives database
  credentials.
- **Object storage:** not required for v1. Add only if exports or documents need
  durable files.

## 3. Runtime choice

### Recommendation

**TypeScript + Fastify** for the API, with **Zod** (or TypeBox) for request/response
validation and **OpenAPI** generated from the schemas. Use a small set of route
modules rather than a large framework. This keeps the service easy to audit, fast to
start, and simple to containerise.

Acceptable alternatives:

- **NestJS** if the team wants enforced structure and dependency injection.
- **Go** if the team has Go experience and wants a smaller runtime image.
- **Python/FastAPI** if the team is stronger in Python; keep the same contract and
  authorization rules.

Avoid:

- Putting business logic in database functions that cannot be unit-tested or
  versioned with the API.
- Letting the client query PostgREST directly for privileged operations.
- A single container that runs both API and worker under one process manager.

### Required middleware

| Concern | Implementation |
|---|---|
| Request ID | Generate/propagate `X-Request-Id`; return it as the support reference |
| Auth | Verify JWT via JWKS; cache keys; reject wrong issuer/audience/expiry |
| Membership | Load active membership per request; attach role + fleet policy |
| Authorization | Capability check before handler; row ownership check in the query |
| Validation | Schema validation; reject unknown fields; bounded string/array sizes |
| Rate limit | Per IP and per user; stricter on auth/invite/export endpoints |
| Idempotency | `Idempotency-Key` on create/update; store result hash + response |
| Errors | Stable envelope; no SQL/stack/hostnames; log correlation ID |
| Audit | Write sensitive events in the same transaction |
| Timeouts | Statement timeout + request timeout; no unbounded queries |
| Pagination | Cursor-based, default and maximum page size |
| Security headers | HSTS, CSP for any HTML, `X-Content-Type-Options`, frame denial |

### Error envelope

```json
{
  "error": {
    "code": "VEHICLE_DUPLICATE",
    "message": "A vehicle with this registration is already in this fleet.",
    "fieldErrors": { "registration_number": "Enter a different registration." },
    "supportReference": "FM-7K2Q9",
    "retryable": false
  }
}
```

The client maps `code` to localized copy. The server never returns raw PostgREST
codes, SQL, stack traces, tokens, or internal hostnames.

## 4. Database access and RLS context

This is the highest-risk part of the design. Neon is standard PostgreSQL, so RLS
works, but only if the runtime role and session context are set correctly.

### 4.1 Roles

| Role | Use | Properties |
|---|---|---|
| `migration_owner` | Migrations only | Owns schema; not used by the API |
| `app_rw` | API runtime | Not the table owner; limited grants; RLS enforced |
| `app_ro` | Read-only reporting (optional) | Select-only; RLS enforced |
| `worker` | Background jobs | Narrow grants; can write notifications/audit |

Run `ALTER TABLE ... FORCE ROW LEVEL SECURITY` so the owner is not exempt. Never
connect the API as `migration_owner` or a superuser.

### 4.2 Tenant context per transaction

At the start of every transaction:

```sql
SET LOCAL app.user_id = '...';
SET LOCAL app.fleet_id = '...';
SET LOCAL app.role = 'fleet_admin';
```

Policies read `current_setting('app.fleet_id', true)::uuid` and compare with
`fleet_id`; role checks read `current_setting('app.role', true)`. `SET LOCAL` is
transaction-scoped, so a pooled connection cannot leak context to the next request.
Keep transactions short; do not hold a connection across an external call.

For jobs that span fleets, use a separate `worker` role and explicit fleet loops;
never disable RLS globally for convenience.

### 4.3 Connection pooling

- Use Neon's pooled connection string for the API.
- Use the direct connection for migrations and long-running admin tasks.
- Budget: `instances × pool_max` must stay below the Neon connection limit, with
  headroom for migrations, workers, and support.
- Set `statement_timeout`, `idle_in_transaction_session_timeout`, and a bounded pool
  queue. Reject rather than queue indefinitely.
- Do not open a transaction per row in application loops.

### 4.4 Neon feature check (before Phase 1)

Confirm and record:

- [ ] Neon region nearest the API host; latency measured.
- [ ] Pooled and direct connection strings work from the host.
- [ ] PITR/backup window, branching, and restore procedure.
- [ ] `pgcrypto`, `citext`, `pg_trgm` availability (or alternatives).
- [ ] Connection limits and pooler mode.
- [ ] `SET LOCAL` behaves correctly through the pooler.
- [ ] **`pg_cron` availability** — do not assume it. Neon is not Supabase; plan an
      external scheduler if it is unavailable.
- [ ] Metrics/log export available for alerting.
- [ ] IP allowlist / private networking options.

## 5. Docker packaging

### API image

- Multi-stage build: install deps, compile TypeScript, copy production artefacts.
- Non-root user; read-only root filesystem where possible.
- No secrets, `.env`, source maps, or dev dependencies in the final image.
- `HEALTHCHECK` or host-level health check against `/healthz` (liveness) and
  `/readyz` (DB + IdP reachability).
- Graceful shutdown on `SIGTERM`: stop accepting, drain, close DB pool.
- Pin base image digests; scan with Trivy/Grype in CI.
- One process per container; scale by adding replicas.

### Worker image

Same build, different command. It must be safe to run more than one replica:
`pg_try_advisory_lock` or a job-lease table prevents duplicate work.

### Compose for local development

- API, worker, and a local Postgres (or a Neon development branch).
- Seed data with two fleets for isolation tests.
- No production secrets; use a local `.env.example`.

## 6. Hosting options

| Host | Strengths | Watch-outs | Fit |
|---|---|---|---|
| **Render** | Simple Docker deploy, managed secrets, cron jobs, health checks, autoscaling, regions | Fewer advanced networking controls; verify region near Neon | Recommended for v1 |
| **Google Cloud Run** | Scale-to-zero, jobs, secrets, IAM, regions | More setup; cold starts; need Cloud SQL/Neon networking care | Strong if already on GCP |
| **Fly.io** | Global machines, fast deploys, volumes, scheduled machines | More operational detail; persistent volumes need care | Good for latency-sensitive multi-region later |
| **Railway** | Very simple, good DX | Less enterprise control; verify SLAs/regions | Prototype/small launch |
| **AWS ECS/Fargate** | Mature, VPC, IAM, ALB, autoscaling | Highest setup and cost complexity | Only with AWS operations experience |
| **Azure Container Apps** | Similar to Cloud Run, Azure integration | More setup | If Azure is the organisational standard |

### Recommendation

Start with **Render** (or **Cloud Run** if the team is already on GCP) in the same
region as Neon. Requirements:

- managed secret storage and rotation;
- health checks and zero-downtime deploys;
- scheduled jobs or a worker service;
- rolling/blue-green deploy and one-click rollback to a previous image;
- structured log export and metrics;
- TLS and a custom domain;
- staging and production as separate services with separate secrets.

Do not select a host that cannot run a scheduled worker or reach Neon over a stable,
low-latency connection.

## 7. Scheduler and background jobs

The current alerts depend on Supabase `pg_cron` (`supabase/schema.sql:820-843`).
Do not assume Neon provides an equivalent (confirm in the feature check). Use one
of:

1. **Host cron job** (Render cron, Cloud Run job, Fly scheduled machine) that runs a
   worker command.
2. **Worker loop** with a lease/advisory lock, running every 15–60 minutes.
3. **Managed queue** (only if job volume justifies it).

Requirements:

- `pg_try_advisory_lock` or a `job_runs` lease row to prevent concurrent runs.
- Idempotent upserts keyed by `(user_id, source_type, source_id, state)`.
- A `job_heartbeats` row updated on success; alert if the last success is older than
  90 minutes.
- Bounded batch size and per-fleet processing to avoid long transactions.
- Retry with backoff for transient failures; dead-letter/record permanent failures.
- No secrets or full row contents in job logs.

Recommended schedule: notification generation every 30 minutes (or hourly), plus a
daily reconciliation pass. Exports should be synchronous for v1 unless size demands
a queue.

## 8. Realtime

Supabase Realtime is not part of Neon. The current app refreshes dashboard, vehicle
list, notifications, and unread badge on database changes
(`src/lib/hooks.js:11-48`). For v1:

**Recommended:** replace with revalidate-on-focus plus a short poll (30–60 seconds)
for the dashboard, vehicle list, notifications, and unread badge. This is simple,
battery-reasonable, and adequate for small fleets.

**Optional later:** an authenticated SSE endpoint that emits fleet-scoped change
events. Avoid building a WebSocket cluster until metrics show polling is
insufficient.

Whatever is chosen, the PRD must state the realtime expectation so Flutter and the
PWA behave the same way.

## 9. Observability

| Signal | Minimum |
|---|---|
| Structured logs | JSON with timestamp, level, request ID, route, status, latency, user ID (pseudonymous), fleet ID, error code. No tokens, passwords, emails, notes, or full request bodies |
| Errors | Sentry (or equivalent) with release + correlation ID; PII scrubbing |
| Metrics | Request rate, p50/p95/p99 latency, 5xx rate, DB pool saturation, query time, job duration/failures, notification counts |
| Traces | OpenTelemetry across API → DB; sample aggressively at low volume |
| Uptime | External check on `/healthz` and a synthetic sign-in/read flow |
| Alerts | 5xx > 2% for 5 min; p95 > 1 s for 10 min; pool > 80%; job failure or missed heartbeat; DB connections > 80%; auth failure spike |
| Dashboards | One service dashboard and one job dashboard; link in the runbook |

## 10. CI/CD and migrations

### Pipeline

1. Lint and unit tests.
2. Build API and worker images; scan for vulnerabilities.
3. Run integration tests against an ephemeral Postgres/Neon branch.
4. Run migration dry-run; fail on drift or destructive changes without approval.
5. Push images with immutable tags (git SHA).
6. Deploy to staging; run smoke tests and tenant-isolation tests.
7. Manual approval for production.
8. Pre-deploy snapshot/PITR marker; run migrations as a separate job; deploy API;
   verify health; keep the previous image for rollback.

### Migration rules

- Forward-only, versioned, checksummed; one logical change per migration.
- Expand/contract for zero-downtime changes (add nullable, backfill, switch reads,
  then enforce).
- No `DROP COLUMN`, `DROP POLICY`, or destructive data changes without a reviewed
  plan and backup.
- Migrations run with a dedicated role and direct connection, not the pooled API
  connection.
- Record applied migrations in a ledger; never edit an applied migration.
- Rollback = restore snapshot/PITR or roll forward with a corrective migration.
  Application rollback uses the previous image; database rollback is not assumed.

### Secrets

- Host secret manager, injected at runtime. No secrets in images, Git, logs, or
  client bundles.
- Separate secrets per environment; rotate on staff change.
- The API uses the IdP JWKS and its own DB credentials; the worker gets only what it
  needs.

## 11. Consequences

Positive:

- Stateless API and worker scale horizontally within Neon's connection budget.
- Docker images are repeatable across staging and production.
- RLS remains meaningful with a non-owner role and transaction-scoped context.
- External scheduling removes the Supabase `pg_cron` dependency.
- Observability and rollback are designed in, not added later.

Costs and risks:

- More moving parts than the current direct-to-Supabase app.
- Host/vendor selection adds cost and lock-in.
- Pooling and RLS context require careful implementation and tests.
- Polling realtime may feel less immediate than Supabase Realtime.
- Migration and rollback discipline must be enforced in CI, not by convention.

## 12. Decision requested

1. Approve the API/worker architecture and TypeScript/Fastify recommendation.
2. Choose the host: Render (recommended), Cloud Run, Fly.io, or another option.
3. Confirm the region (same as Neon) and whether private networking is required.
4. Approve the scheduler approach and the 30–60 minute cadence.
5. Approve polling/revalidate-on-focus for v1 realtime, with SSE as a later option.
6. Approve the observability stack and alert thresholds.
7. Approve the CI/CD gate and migration/rollback rules.
8. Confirm who has production deploy and secret-manager access.

## 13. Sign-off

| Item | Decision | Date | Notes |
|---|---|---|---|
| Runtime/framework | | | |
| Host + region | | | |
| Scheduler | | | |
| Realtime approach | | | |
| Observability | | | |
| CI/CD + rollback | | | |
| Production access | | | |
