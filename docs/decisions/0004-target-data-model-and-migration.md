# D-04 — Target data model, RLS, audit, retention, and migration

**Status:** Partially accepted — the one-active-membership constraint is approved and
the vehicle-permission rule is incorporated. PRD v0.3 additions below are **Proposed**.
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD v0.3 §6, §7.3–§7.8, §9, §11, §16 (target schema, operational and
financial records, data migration, retention)
**Depends on:** D-01 (roles/membership), D-02 (identity)
**Blocks:** Phase 1 schema, API, and migration

## 1. Context

The current schema has four tables (`fleets`, `profiles`, `vehicles`,
`notifications`) and encodes membership as `profiles.fleet_id`
(`supabase/schema.sql`). It has no membership status, no audit log, no foreign keys
on tenant columns, and a cascade from `auth.users` to `vehicles` that can delete
shared fleet data. The setup SQL is an upgrade script that drops and recreates
policies, not a migration history.

This decision defines the target schema, the RLS model, the audit and retention
rules, and a migration plan that can be rehearsed and rolled back.

**PRD v0.3 reconciliation (Proposed):** PRD v0.3 adds owner-entered driver activity,
vehicle assignments, hire/dispatch, mileage/fuel, itemized maintenance and operating
expenses, daily income, driver remittances/settlements, and a finance-only role. The
tables and rules below capture those requirements. All new operational/financial
details are **Proposed**; the existing membership constraint and previously signed
vehicle-permission rule remain accepted. Exact accounting semantics, categories,
settlement cycle, currency, and receipt rules must be confirmed before implementation.

## 2. Design principles

1. **Every tenant row has a non-null `fleet_id` with a foreign key.** No exceptions.
2. **Identity is separate from membership.** A user can exist without a fleet; a
   membership links them with a role and status.
3. **Users are never deleted to remove access.** Membership status is the access
   control; user records are retained or anonymised per policy.
4. **Derived vehicle status is computed, not stored.** Vehicle compliance status is
   derived from dates at read time; operational status is derived from hires,
   assignments, and availability blocks. Do not carry a vehicle `status` column.
   Financial entry status such as `posted`/`reversed` is a stored state, not a
   derived display value.
5. **Audit is append-only.** No application role can update or delete audit rows.
6. **Dates are date-only; "today" is evaluated in the fleet timezone.**
7. **Soft delete for vehicles.** Hard deletes are reserved for retention expiry and
   are audited.
8. **RLS is defense in depth.** The API authorizes first; the database repeats the
   check under a non-owner role.
9. **Operational and financial records are separate.** Hires, mileage, fuel,
   maintenance, income, expenses, remittances, and settlements are distinct records;
   summaries must not silently net them together.
10. **Financial history is corrected by reversal, not overwrite.** Posted entries
    retain who entered/changed them, when, and why.
11. **Permissions, not scattered role-name checks.** The API resolves a permission
    set; RLS checks the same permissions where module access matters.

## 3. Target tables

### 3.1 `fleets`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `name` | text | `NOT NULL`, `CHECK (length(btrim(name)) BETWEEN 1 AND 80)` |
| `timezone` | text | `NOT NULL` default `'UTC'`, validated against IANA names by the API |
| `status` | enum | `pending`, `active`, `suspended`, `closed`; default `pending` |
| `owner_user_id` | uuid | FK → `users(id)` `ON DELETE RESTRICT`, nullable only while pending |
| `status_window_days` | integer | `NOT NULL` default 30, `CHECK IN (7,14,30,60,90)` |
| `policy` | jsonb | Defaults from D-01; validated by the API |
| `created_at` | timestamptz | `NOT NULL` default now |
| `updated_at` | timestamptz | `NOT NULL` default now |

The owner must always hold an active `fleet_owner` membership in the same fleet.
Under the approved v1 rule, the owner cannot simultaneously be active in another
fleet. Enforce both in the API and verify them after migration (§7.6). The
`fleet_owner` role and the exact owner/admin delegation model are **Proposed** in
D-01. See D-01 §6 for the proposed interpretation of PRD §7.1/§7.2 "Fleet Admin"
wording.

### 3.2 `users`

Local identity mapping. The identity provider remains the source of credentials.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `idp_subject` | text | `NOT NULL`, `UNIQUE` |
| `email` | citext | `NOT NULL`, `UNIQUE` (normalised) |
| `display_name` | text | `NOT NULL`, max 120 |
| `status` | enum | `active`, `suspended`, `closed` |
| `last_seen_at` | timestamptz | Nullable |
| `created_at` | timestamptz | `NOT NULL` default now |
| `updated_at` | timestamptz | `NOT NULL` default now |

Notes:

- Do not store password hashes, MFA secrets, or tokens in this table.
- Email changes are handled through the IdP; the local row is updated by webhook or
  reconciliation.
- A user with no active membership is valid and sees the recovery screen.

### 3.3 `fleet_memberships`

As defined in D-01 §5.1. Key constraints:

- `fleet_id` `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT`.
- `user_id` `NOT NULL` FK → `users(id)` `ON DELETE RESTRICT`.
- `role` enum: `fleet_owner`, `fleet_admin`, `fleet_manager`, `finance_manager`, `fleet_member`, `read_only`.
- `status` enum: `invited`, `active`, `suspended`, `removed`.
- `UNIQUE (fleet_id, user_id)`.
- Partial unique index `(user_id) WHERE status = 'active'` (one active fleet in
  v1).
- Partial unique index `(fleet_id) WHERE role = 'fleet_owner' AND status = 'active'`
  (exactly one active Fleet Owner; **Proposed**).
- Index `(fleet_id, status)` for team lists.

The Fleet Owner must match `fleets.owner_user_id`; ownership transfer updates both
in one transaction. The exact delegation rules for Fleet Admin and Finance Manager
are **Proposed** in D-01.

**Approved 25 October 2026:** v1 allows one active membership per user. The partial
unique index is the database backstop. The API must fail closed if it finds no active
membership or, because of a data bug, more than one; it must never guess a fleet.
Expanding to multi-fleet later means dropping the index and adding an explicit
active-fleet context (D-01 §5.4), not rewriting this table.

### 3.4 `fleet_invitations` (only if the IdP does not manage invites)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE CASCADE` |
| `email` | citext | `NOT NULL` |
| `role` | enum | Same as membership except `fleet_owner`; cannot be `fleet_admin` or `finance_manager` unless the inviter has authority |
| `token_hash` | text | `NOT NULL`, unique; never store the raw token |
| `invited_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `expires_at` | timestamptz | `NOT NULL` |
| `accepted_at` | timestamptz | Nullable |
| `revoked_at` | timestamptz | Nullable |
| `created_at` | timestamptz | `NOT NULL` default now |

Partial unique index on `(fleet_id, lower(email)) WHERE accepted_at IS NULL AND
revoked_at IS NULL`.

### 3.5 `vehicles`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `registration_number` | text | `NOT NULL`, max 24 |
| `registration_normalized` | text | Generated: `lower(btrim(registration_number))`, stored |
| `make` | text | `NOT NULL`, max 60 |
| `model` | text | `NOT NULL`, max 60 |
| `year` | integer | `NOT NULL`, `CHECK (year BETWEEN 1900 AND 2100)` |
| `colour` | text | Nullable, max 40 |
| `notes` | text | Nullable, max 2000 |
| `insurance_expiry` | date | Nullable |
| `road_tax_expiry` | date | Nullable |
| `roadworthy_expiry` | date | Nullable |
| `next_service_date` | date | Nullable |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `updated_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` | timestamptz | `NOT NULL` default now |
| `updated_at` | timestamptz | `NOT NULL` default now |
| `deleted_at` | timestamptz | Nullable (soft delete) |
| `deleted_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |

Constraints:

- `UNIQUE (fleet_id, registration_normalized) WHERE deleted_at IS NULL`.
- Restoring a soft-deleted vehicle must fail with a plain-language message if an
  active vehicle already uses that registration in the fleet; do not silently merge.
- Index `(fleet_id, deleted_at)` for lists.
- Index `(fleet_id, insurance_expiry)`, `(fleet_id, road_tax_expiry)`,
  `(fleet_id, roadworthy_expiry)`, `(fleet_id, next_service_date)` for status
  queries; or a single index if query patterns justify it.
- **Never** cascade from `users` to vehicles. `created_by` is `SET NULL`.
- Only `fleet_owner`, `fleet_admin`, and `fleet_manager` may set
  `deleted_at`/`deleted_by`; Fleet Members may never delete or restore. Enforce in
  the API, RLS, and a trigger (see §6.2). The Fleet Owner addition is **Proposed**;
  the Fleet Admin/Manager rule is already approved.
- Do not store a derived `status` column. The legacy `status` column is ignored and
  removed after migration.

**Document model decision:** keep the four expiry date columns in v1 for parity
with the current app. This is the "expiry dates" option in PRD §9. It avoids a large
UI/API change and still supports alerts. Renewal history comes from `audit_events`
(before/after date changes). If the product later needs per-document references,
issued dates, multiple documents of the same type, or document uploads, add a
`vehicle_documents` table in Phase 4 and migrate the four dates into it. Do not add
both models in v1.

### 3.6 `drivers` and `vehicle_assignments` (Proposed)

**`drivers`** — driver records are maintained by the Fleet Owner or an authorized
manager; drivers do not have app accounts in v1.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `full_name` | text | `NOT NULL`, max 120 |
| `phone` | text | Nullable, max 32 |
| `licence_number` | text | Nullable, max 40 |
| `licence_expiry` | date | Nullable |
| `status` | enum | `active`, `inactive`; default `active` |
| `notes` | text | Nullable, max 2000 |
| `created_by` / `updated_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |
| `deleted_at` | timestamptz | Nullable soft delete |

Constraints and notes (**Proposed**):

- Unique `(fleet_id, licence_number)` where the licence is present and not
  soft-deleted, if licence numbers are confirmed as unique per fleet.
- Index `(fleet_id, status)` for active/inactive lists.
- Deactivation preserves assignment and financial history. Never cascade-delete a
  driver with records.
- Personal and licence data is limited to what operations need; retention is
  proposed in §8.

**`vehicle_assignments`** — the link between a driver and a vehicle for a period,
shift, or hire.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | `NOT NULL` FK → `drivers(id)` `ON DELETE RESTRICT` |
| `assignment_type` | enum | `period`, `shift`, `hire`, `other`; default `period` |
| `starts_at` | timestamptz | `NOT NULL` |
| `ends_at` | timestamptz | Nullable; `CHECK (ends_at IS NULL OR ends_at > starts_at)` |
| `status` | enum | `planned`, `active`, `ended`, `cancelled`; default `planned` |
| `override_reason` | text | Nullable; required only for an authorized overlapping assignment |
| `created_by` / `updated_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

Constraints and notes (**Proposed**):

- Prevent overlapping active assignments for the same vehicle. A second active
  assignment requires ending/cancelling the first or an explicit, permissioned
  override with a reason and audit event.
- Consider the same overlap rule for a driver across vehicles.
- Index `(fleet_id, vehicle_id, status)`, `(fleet_id, driver_id, status)`, and
  `(fleet_id, starts_at)`.
- Assignment history is never hard-deleted.

**`vehicle_availability_blocks`** — explicit maintenance/unavailable periods that
are not a driver assignment.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `reason` | enum | `maintenance`, `unavailable`, `other` |
| `starts_at` | timestamptz | `NOT NULL` |
| `ends_at` | timestamptz | Nullable; `CHECK (ends_at IS NULL OR ends_at > starts_at)` |
| `notes` | text | Nullable, max 1000 |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

- Operational vehicle status is derived from active hires, assignments, and open
  availability blocks; do not store it on `vehicles` (see §4.3).
- Index `(fleet_id, vehicle_id, starts_at, ends_at)`.
- Creating or ending a block is audited.

### 3.7 `hires`, dispatch, and `odometer_readings` (Proposed)

**`hires`** — the operational hire/dispatch record. Customer/booking fields are not
added until PRD Phase 0 confirms them.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | `NOT NULL` FK → `drivers(id)` `ON DELETE RESTRICT` |
| `assignment_id` | uuid | Nullable FK → `vehicle_assignments(id)` `ON DELETE SET NULL` |
| `status` | enum | `planned`, `active`, `completed`, `cancelled`; `overdue` is derived |
| `starts_at` | timestamptz | `NOT NULL` |
| `expected_end_at` | timestamptz | Nullable |
| `actual_end_at` | timestamptz | Nullable |
| `start_odometer_km` | numeric(12,1) | Nullable |
| `end_odometer_km` | numeric(12,1) | Nullable; `CHECK (end_odometer_km IS NULL OR start_odometer_km IS NULL OR end_odometer_km >= start_odometer_km)` |
| `distance_km` | numeric(12,1) | Generated from the two odometer readings when both exist |
| `override_reason` | text | Nullable; required only for an authorized overlapping active hire |
| `notes` | text | Nullable, max 2000 |
| `created_by` / `updated_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

Constraints and notes (**Proposed**):

- At most one active hire per vehicle and one active hire per driver, unless an
  authorized manager explicitly resolves a conflict with a reason and audit.
- `actual_end_at` must be at or after `starts_at` when present.
- `overdue` is derived from `expected_end_at < now()` and an unfinished hire; do not
  store it.
- Index `(fleet_id, status, expected_end_at)` and `(fleet_id, vehicle_id, starts_at
  DESC)`.
- Customer, booking, passenger, or marketplace details are out of scope until
  confirmed.

**`odometer_readings`** — a single source of odometer history.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `hire_id` | uuid | Nullable FK → `hires(id)` `ON DELETE SET NULL` |
| `driver_id` | uuid | Nullable FK → `drivers(id)` `ON DELETE SET NULL` |
| `reading_km` | numeric(12,1) | `NOT NULL`, `CHECK (reading_km >= 0)` |
| `recorded_at` | timestamptz | `NOT NULL` |
| `source` | enum | `hire_start`, `hire_end`, `fuel`, `service`, `manual` |
| `notes` | text | Nullable, max 1000 |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` | timestamptz | `NOT NULL` default now |

- Index `(fleet_id, vehicle_id, recorded_at DESC)`.
- Flag implausible decreases or duplicate readings for correction; do not silently
  accept them.
- Hire start/end readings should create the corresponding hire fields in the same
  transaction.

### 3.8 Fuel, expenses, and `expense_categories` (Proposed)

**`expense_categories`** — fleet-scoped categories; seed common defaults without
requiring a global catalog.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `code` | text | `NOT NULL`, max 40; unique per fleet |
| `name` | text | `NOT NULL`, max 80 |
| `kind` | enum | `fuel`, `maintenance`, `parts`, `consumable`, `other` |
| `is_active` | boolean | `NOT NULL` default true |
| `sort_order` | integer | `NOT NULL` default 0 |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

- Add `UNIQUE (fleet_id, code)`.

**`fuel_purchases`** — operational detail for a fuel purchase.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | Nullable FK → `drivers(id)` `ON DELETE SET NULL` |
| `purchased_at` | timestamptz | `NOT NULL` |
| `quantity_litres` | numeric(10,2) | `NOT NULL`, `CHECK (quantity_litres > 0)` |
| `unit_price` | numeric(14,4) | `NOT NULL`, `CHECK (unit_price >= 0)` |
| `total_cost` | numeric(14,2) | `NOT NULL`, `CHECK (total_cost >= 0)` |
| `currency` | char(3) | `NOT NULL`; ISO 4217; `ZMW` proposed |
| `odometer_km` | numeric(12,1) | Nullable, `CHECK (odometer_km >= 0)` |
| `supplier` | text | Nullable, max 120 |
| `payment_method` | text | Nullable, max 40 |
| `receipt_attachment_id` | uuid | Nullable FK → `attachments(id)` `ON DELETE SET NULL` |
| `notes` | text | Nullable, max 1000 |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

**`expenses`** — the financial ledger for money out. Reports read this table, so a
fuel purchase or maintenance record cannot be counted twice.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `category_id` | uuid | `NOT NULL` FK → `expense_categories(id)` `ON DELETE RESTRICT` |
| `incurred_on` | date | `NOT NULL` |
| `description` | text | `NOT NULL`, max 500 |
| `amount` | numeric(14,2) | `NOT NULL`, `CHECK (amount > 0)` |
| `currency` | char(3) | `NOT NULL`; ISO 4217 |
| `supplier` / `payee` | text | Nullable, max 120 |
| `payment_method` | text | Nullable, max 40 |
| `receipt_attachment_id` | uuid | Nullable FK → `attachments(id)` `ON DELETE SET NULL` |
| `fuel_purchase_id` | uuid | Nullable, unique FK → `fuel_purchases(id)` `ON DELETE RESTRICT` |
| `maintenance_record_id` | uuid | Nullable, unique FK → `maintenance_records(id)` `ON DELETE RESTRICT` |
| `status` | enum | `posted`, `reversed`; default `posted` |
| `reverses_expense_id` | uuid | Nullable, unique FK → `expenses(id)` `ON DELETE RESTRICT` |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

Rules (**Proposed**):

- Each fuel purchase and each maintenance record creates exactly one `expenses` row;
  a generic expense has neither source ID. Add a check that at most one source is
  set. The expense amount must equal the detail total (`fuel_purchases.total_cost` or
  `maintenance_records.total_cost`); enforce in the API and a trigger.
- Posted expenses are corrected by a reversal row; no hard delete and no silent
  overwrite.
- Financial summaries use `expenses`, not the detail tables, to avoid double
  counting.
- Categories, receipt requirements, and whether fuel and maintenance totals are
  entered per line or per record remain open.

### 3.9 `maintenance_records` and `maintenance_items` (Proposed)

**`maintenance_records`** — dated work history and the header for itemized costs.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `performed_on` | date | `NOT NULL` |
| `odometer_km` | numeric(12,1) | Nullable, `CHECK (odometer_km >= 0)` |
| `service_provider` | text | Nullable, max 120 |
| `supplier` | text | Nullable, max 120; parts/materials supplier when different |
| `work_description` | text | `NOT NULL`, max 2000 |
| `notes` | text | Nullable, max 2000 |
| `total_cost` | numeric(14,2) | `NOT NULL`, `CHECK (total_cost >= 0)` |
| `currency` | char(3) | `NOT NULL`; ISO 4217 |
| `receipt_attachment_id` | uuid | Nullable FK → `attachments(id)` `ON DELETE SET NULL` |
| `created_by` / `updated_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

**`maintenance_items`** — itemized parts/materials/labour.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `maintenance_record_id` | uuid | `NOT NULL` FK → `maintenance_records(id)` `ON DELETE CASCADE` |
| `category` | enum/text | `parts`, `consumable`, `labour`, `inspection`, `other` |
| `description` | text | `NOT NULL`, max 500 |
| `quantity` | numeric(10,2) | `NOT NULL` default 1, `CHECK (quantity > 0)` |
| `unit_cost` | numeric(14,4) | `NOT NULL`, `CHECK (unit_cost >= 0)` |
| `line_total` | numeric(14,2) | `NOT NULL`, `CHECK (line_total >= 0)` |
| `part_number` | text | Nullable, max 80 |
| `sort_order` | integer | `NOT NULL` default 0 |

Rules (**Proposed**):

- The sum of itemized lines must reconcile to the maintenance record total unless a
  deliberate rounding/labour difference is documented.
- Common entries include batteries, engine oil, tyres, filters, repairs,
  inspections, and other parts; a fixed catalog is not required.
- Maintenance work and its expense remain distinct from income and remittances.

### 3.10 Income, driver ledger, and settlements (Proposed)

**`income_entries`** — daily earnings by vehicle and driver.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | `NOT NULL` FK → `vehicles(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | `NOT NULL` FK → `drivers(id)` `ON DELETE RESTRICT` |
| `hire_id` | uuid | Nullable FK → `hires(id)` `ON DELETE SET NULL` |
| `entry_date` | date | `NOT NULL` |
| `amount` | numeric(14,2) | `NOT NULL`, `CHECK (amount > 0)` |
| `currency` | char(3) | `NOT NULL`; ISO 4217 |
| `source_type` | enum | `fare`, `daily_fee`, `other`; exact values proposed |
| `payment_method` | text | Nullable, max 40 |
| `notes` | text | Nullable, max 1000 |
| `status` | enum | `posted`, `reversed`; default `posted` |
| `reverses_income_id` | uuid | Nullable, unique FK → `income_entries(id)` `ON DELETE RESTRICT` |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

**`driver_ledger_entries`** — the proposed ledger for what a driver owes, has
remitted, or holds.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | `NOT NULL` FK → `drivers(id)` `ON DELETE RESTRICT` |
| `vehicle_id` | uuid | Nullable FK → `vehicles(id)` `ON DELETE SET NULL` |
| `income_entry_id` | uuid | Nullable FK → `income_entries(id)` `ON DELETE SET NULL` |
| `settlement_id` | uuid | Nullable FK → `driver_settlements(id)` `ON DELETE SET NULL` |
| `entry_type` | enum | `income_due`, `remittance_received`, `adjustment`, `write_off` |
| `cash_holder` | enum | `business`, `driver`, `none`; exact use proposed |
| `amount` | numeric(14,2) | `NOT NULL`; signed according to entry type |
| `currency` | char(3) | `NOT NULL`; ISO 4217 |
| `occurred_on` | date | `NOT NULL` |
| `payment_method` | text | Nullable, max 40 |
| `reference` | text | Nullable, max 80 |
| `receipt_attachment_id` | uuid | Nullable FK → `attachments(id)` `ON DELETE SET NULL` |
| `notes` | text | Nullable, max 1000 |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` | timestamptz | `NOT NULL` default now |

**`driver_settlements`** — period snapshot for expected versus received amounts.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `driver_id` | uuid | `NOT NULL` FK → `drivers(id)` `ON DELETE RESTRICT` |
| `period_start` / `period_end` | date | `NOT NULL`, `CHECK (period_end >= period_start)` |
| `currency` | char(3) | `NOT NULL`; ISO 4217 |
| `expected_amount` / `received_amount` | numeric(14,2) | `NOT NULL` default 0, `CHECK >= 0` |
| `status` | enum | `open`, `partially_paid`, `settled`, `overdue`; exact derivation proposed |
| `closed_at` | timestamptz | Nullable |
| `created_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` / `updated_at` | timestamptz | `NOT NULL` default now |

Rules (**Proposed**):

- **10-day settlement cycle** is the PRD's starting assumption, not a confirmed
  accounting rule. Daily entry and the exact expected amount must be confirmed.
- Record cash collected by the business, cash held by a driver, remittances,
  adjustments, and outstanding balances as separate ledger entries.
- Derive balances from the ledger; do not overwrite posted entries. Corrections are
  reversal entries with an audit reason.
- Keep income, operating expenses, and remittances separate. Operational summaries
  are not statutory accounting or tax advice.
- `ZMW` is proposed; store an explicit ISO currency on every financial record.
- Receipt requirements, payment methods, and whether multiple currencies are
  supported remain open.

### 3.11 `attachments` (Proposed)

Receipts and invoices are stored outside the database; the database holds metadata
and ownership only.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE RESTRICT` |
| `owner_type` | enum | `fuel_receipt`, `maintenance_receipt`, `expense_receipt`, `remittance_receipt`, `other` |
| `owner_id` | uuid | `NOT NULL`; interpreted with `owner_type` |
| `storage_key` | text | `NOT NULL`, unique; never a public URL |
| `file_name` | text | `NOT NULL`, max 255 |
| `content_type` | text | `NOT NULL`, max 100 |
| `size_bytes` | bigint | `NOT NULL`, `CHECK (size_bytes > 0)` |
| `sha256` | text | Nullable; integrity check |
| `uploaded_by` | uuid | FK → `users(id)` `ON DELETE SET NULL` |
| `created_at` | timestamptz | `NOT NULL` default now |
| `deleted_at` | timestamptz | Nullable soft delete |

- Storage provider, scanning, signed-URL lifetime, and retention are **Proposed**
  (D-03/D-04).
- A finance user can attach a receipt only to a record they may edit.

### 3.12 `notification_preferences`

| Column | Type | Constraints |
|---|---|---|
| `user_id` | uuid | `NOT NULL` FK → `users(id)` `ON DELETE CASCADE` |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE CASCADE` |
| `expiry_alerts` | boolean | `NOT NULL` default true |
| `maintenance_reminders` | boolean | `NOT NULL` default true |
| `expiry_window_days` | integer | `NOT NULL` default 30, `CHECK IN (7,14,30,60,90)` |
| `email_enabled` | boolean | `NOT NULL` default false (future) |
| `updated_at` | timestamptz | `NOT NULL` default now |
| PK | | `(user_id, fleet_id)` |

### 3.13 `notifications`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `fleet_id` | uuid | `NOT NULL` FK → `fleets(id)` `ON DELETE CASCADE` |
| `user_id` | uuid | `NOT NULL` FK → `users(id)` `ON DELETE CASCADE` |
| `vehicle_id` | uuid | Nullable FK → `vehicles(id)` `ON DELETE CASCADE` |
| `source_type` | enum | `insurance`, `road_tax`, `roadworthy`, `service`, `maintenance_due`, `vehicle_added`, `system` |
| `source_id` | uuid | Nullable; for vehicle events, the vehicle ID |
| `state` | enum | `due_soon`, `expired`, `overdue`, `info` |
| `dedupe_key` | text | `NOT NULL`; unique per user |
| `title` | text | `NOT NULL` |
| `message` | text | `NOT NULL` |
| `type` | enum | `success`, `warning`, `danger`, `info` |
| `read_at` | timestamptz | Nullable; `NULL` = unread |
| `created_at` | timestamptz | `NOT NULL` default now |
| `updated_at` | timestamptz | `NOT NULL` default now |

Constraints:

- `UNIQUE (user_id, dedupe_key)`.
- Index `(user_id, read_at)` for unread counts.
- Index `(fleet_id, created_at DESC)` for lists.
- Dedupe key format:
  `v1:{fleet_id}:{vehicle_id}:{source_type}:{state}`. Include the fleet so future
  multi-fleet users cannot collide.
- Manual/system notifications use a unique key such as `v1:system:{event_id}`.
- `service` covers the date-based next-service reminder. `maintenance_due` is the
  proposed mileage/time threshold reminder; it includes the threshold or odometer
  value in the dedupe key so a new threshold creates a new alert. Exact thresholds
  and the odometer source are **Proposed**.

### 3.14 `audit_events`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `occurred_at` | timestamptz | `NOT NULL` default now |
| `actor_user_id` | uuid | Nullable FK → `users(id)` `ON DELETE SET NULL` |
| `actor_type` | enum | `user`, `platform_admin`, `worker`, `migration` |
| `fleet_id` | uuid | Nullable FK → `fleets(id)` `ON DELETE SET NULL` |
| `action` | text | `NOT NULL` (stable event name) |
| `target_type` | text | Nullable |
| `target_id` | uuid/text | Nullable |
| `reason` | text | Nullable; required for support access and destructive admin actions |
| `correlation_id` | text | `NOT NULL` |
| `ip` | inet | Nullable |
| `user_agent` | text | Nullable |
| `metadata` | jsonb | Redacted, minimal; no notes/passwords/tokens |

Rules:

- Append-only: revoke `UPDATE` and `DELETE` from `app_rw` and `worker`; add a trigger
  that raises on update/delete.
- Index `(fleet_id, occurred_at DESC)`, `(actor_user_id, occurred_at DESC)`,
  `(target_type, target_id)`.
- Partition by month if volume grows; start unpartitioned.
- Retention: 24 months (confirm). Legal hold overrides deletion.
- Audit reads are themselves audited for Super Admin support access; the Fleet Owner
  and authorized fleet admins can read their fleet's audit events.

### 3.15 `platform_admins`, `support_access_grants`

Per D-01 §8:

- `platform_admins`: `user_id`, `status`, `mfa_enrolled_at`, `created_by`,
  timestamps.
- `support_access_grants`: `id`, `platform_admin_id`, `fleet_id`, `scope`
  (`read`/`write`/`export`), `reason`, `ticket_ref`, `starts_at`, `expires_at`,
  `revoked_at`, `approved_by`, `created_at`.
- Default cross-fleet read is audited; elevated read/write/export uses a grant. The
  exact default-read scope is **Proposed** in D-01 §8.
- No grants on these tables to `app_rw`; use a separate platform role. All access
  through the platform API.

### 3.16 Supporting tables

- `idempotency_keys`: `key`, `user_id`, `endpoint`, `request_hash`,
  `response_status`, `response_body`, `created_at`, `expires_at`; unique
  `(user_id, key)`. Retain 24 hours.
- `job_heartbeats`: `job_name`, `last_started_at`, `last_succeeded_at`,
  `last_error`, `updated_at`.
- `schema_migrations`: managed by the migration tool.

## 4. Status and date semantics

### 4.1 Timezone

- `fleets.timezone` is an IANA name (for example `Africa/Nairobi`).
- The API computes "today" in the fleet timezone, never the device timezone.
- Date-only values are stored as `date`; do not convert them to timestamps.
- A document expiring today is valid until the end of that day in the fleet
  timezone (preserve the current rule in `src/lib/dates.js`, but server-side).

### 4.2 Vehicle status

Evaluate all four dates with this precedence:

1. **Expired** — any tracked date is before today.
2. **Due soon** — no expired date, and any tracked date is within
   `fleets.status_window_days`.
3. **Not tracked** — no expired/due-soon date, but at least one date is missing.
4. **Up to date** — all four dates are present and outside the window.

Dashboard counts should be **vehicle-level** and mutually exclusive:
`total = expired + due_soon + not_tracked + up_to_date`. Show the window
("Due within 30 days"). A separate "Needs attention" list can show document-level
rows.

Notification windows remain per user (`notification_preferences.expiry_window_days`)
and are independent of the dashboard fleet window. The service reminder is capped at
14 days before the service date, as today; document this in the UI.

### 4.3 Operational vehicle status (Proposed)

Derive the operational status; do not store it on `vehicles`:

1. **Maintenance** — an open `vehicle_availability_blocks` row with reason
   `maintenance`.
2. **On hire** — an active `hires` row.
3. **Assigned** — an active `vehicle_assignments` row without an active hire.
4. **Unavailable** — an open block with reason `unavailable` or `other`.
5. **Available** — none of the above.

Overdue is derived from `hires.expected_end_at`; it is not stored. The precedence
between maintenance and an active hire must be confirmed if both can overlap
(**Proposed**).

## 5. Notification lifecycle

- The worker is the **single source of truth** for generated alerts. The client may
  request a refresh endpoint, but it must not insert or delete generated
  notifications. This removes the current duplicated client/DB logic
  (`src/lib/notificationService.js` and `supabase/schema.sql:646-779`).
- For each user, vehicle, source, and state:
  - `due_soon` row when inside the user's window;
  - `expired`/`overdue` row when past the date;
  - delete the other state's row when the state changes;
  - delete both when the date is cleared, the item is renewed, or the category is
    disabled.
- On message refresh with the same state, update title/message and **preserve**
  `read_at`.
- On state change, create the new state as unread (new severity deserves attention).
- De-duplicate with `UNIQUE (user_id, dedupe_key)` and `ON CONFLICT DO UPDATE` for
  the same state.
- Generate in bounded batches per fleet; use `pg_try_advisory_lock` to prevent
  duplicate workers.
- Write a heartbeat; alert if generation has not succeeded in 90 minutes.

## 6. RLS model

### 6.1 Roles and context

Use a non-owner `app_rw` role and `FORCE ROW LEVEL SECURITY`. The API sets:

```sql
SET LOCAL app.user_id = '...';
SET LOCAL app.fleet_id = '...';
SET LOCAL app.role = 'fleet_owner';
SET LOCAL app.permissions = 'fleet.vehicles.manage,finance.expenses.manage';
```

`app.permissions` is resolved server-side from the member's role, fleet policy, and
module grants. It is never accepted from the client. Policies use
`current_setting('app.fleet_id', true)::uuid`, `current_setting('app.role', true)`,
and `app_has_permission('...')`. A missing/blank setting must deny, not allow. Create
helper functions (`app_current_fleet()`, `app_current_role()`,
`app_has_permission(text)`) that return `NULL`/false when unset, and use `IS NOT
NULL` checks where appropriate.

The API derives `app.fleet_id` from the caller's single active membership. No active
membership means deny and return the recovery path; more than one active membership
means deny, log, and alert — never pick one silently.

The role values include `fleet_owner`, `fleet_admin`, `fleet_manager`,
`finance_manager`, `fleet_member`, and `read_only`. The Fleet Owner and Finance
Manager roles are **Proposed** in D-01.

### 6.2 Policy sketches

```sql
-- Vehicles: read within the active fleet, excluding soft-deleted by default.
CREATE POLICY vehicles_select ON vehicles FOR SELECT TO app_rw
USING (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND deleted_at IS NULL
);

-- Helper: true only when the current fleet's policy allows member writes.
-- Keep it STABLE, scoped to app.fleet_id, and grant EXECUTE only to app_rw.
CREATE FUNCTION app_member_can_write() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT (policy->>'member_can_write')::boolean
     FROM fleets
     WHERE id = current_setting('app.fleet_id', true)::uuid),
    false
  )
$$;

-- Vehicles: insert for admins/managers, or members when policy allows.
CREATE POLICY vehicles_insert ON vehicles FOR INSERT TO app_rw
WITH CHECK (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND (
    current_setting('app.role', true) IN ('fleet_owner','fleet_admin','fleet_manager')
    OR (current_setting('app.role', true) = 'fleet_member' AND app_member_can_write())
  )
);

-- Vehicles: update live rows with the same write capability; fleet_id is immutable.
CREATE POLICY vehicles_update ON vehicles FOR UPDATE TO app_rw
USING (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND deleted_at IS NULL
)
WITH CHECK (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND (
    current_setting('app.role', true) IN ('fleet_owner','fleet_admin','fleet_manager')
    OR (current_setting('app.role', true) = 'fleet_member' AND app_member_can_write())
  )
);

-- Vehicles: restore is a separate update, admins/managers only, soft-deleted rows only.
CREATE POLICY vehicles_restore ON vehicles FOR UPDATE TO app_rw
USING (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND deleted_at IS NOT NULL
  AND current_setting('app.role', true) IN ('fleet_owner','fleet_admin','fleet_manager')
)
WITH CHECK (
  fleet_id = current_setting('app.fleet_id', true)::uuid
  AND deleted_at IS NULL
  AND current_setting('app.role', true) IN ('fleet_owner','fleet_admin','fleet_manager')
);

-- Vehicles: no hard deletes through app_rw; deletion is a soft-delete update.
CREATE POLICY vehicles_delete ON vehicles FOR DELETE TO app_rw
USING (false);

-- Soft-delete columns are protected by a BEFORE UPDATE trigger: if deleted_at or
-- deleted_by changes, require app.role in
-- ('fleet_owner','fleet_admin','fleet_manager'). This closes the gap where a Fleet
-- Member's update policy could otherwise set deleted_at.
```

**Approved vehicle permission rule (D-01, 25 October 2026):** Fleet Admins and Fleet
Managers create, edit, delete, and restore; Fleet Members create/edit only; Read-only
Members have no writes. `member_can_write` may restrict Fleet Member create/edit but
cannot grant delete. Hard `DELETE` is denied to `app_rw` for everyone; delete is a
controlled soft-delete update. The API must return a plain-language denial if a
Fleet Member calls delete or restore. The Fleet Owner is **Proposed** to have the same
full vehicle access as a Fleet Admin.

**Operational and finance policies (Proposed v0.3):**

| Table group | Read | Write | Notes |
|---|---|---|---|
| `drivers`, `vehicle_assignments`, `vehicle_availability_blocks`, `hires`, `odometer_readings` | `fleet.operations.read` | `fleet.operations.manage` | Fleet Owner/Admin/Manager by default; Finance Manager gets only minimal context through views |
| `fuel_purchases`, `expense_categories`, `expenses`, `maintenance_records`, `maintenance_items` | `fleet.maintenance.read` / `finance.expenses.read` | `fleet.maintenance.manage` / `finance.expenses.manage` | Finance Manager may manage expenses and receipts; operational maintenance work needs the operations permission |
| `income_entries`, `driver_ledger_entries`, `driver_settlements` | `finance.income.read` / `finance.settlements.read` | `finance.income.manage` / `finance.settlements.manage` | Fleet Owner and Finance Manager by default; Admin/Manager only if granted |
| `attachments` | Permission on the owning record | Permission on the owning record | Signed URLs; no public bucket; finance users cannot attach to records they cannot edit |

- Finance Manager minimal context should be exposed through restricted views or a
  column-limited projection (`v_finance_vehicles`, `v_finance_drivers`), not broad
  table access. If views are used, keep them fleet-scoped and do not bypass RLS with
  an unrestricted definer owner; an API projection with explicit column selection is
  acceptable.
- Financial tables have no hard delete for `app_rw`; corrections are reversal rows.
- Super Admin cross-fleet reads use a separate platform role and audit path, not
  `app_rw`.
- Add isolation tests for every table group: own fleet, other fleet, guessed ID, and
  missing permission.

Use the same pattern for notifications (always `user_id = app.user_id`),
memberships (Fleet Owner/authorized admins manage; Fleet Managers only when
granted; members read), audit (no direct writes), and preferences (self only).

### 6.3 Policy rules

- Every policy is scoped to the current fleet, except platform tables.
- `WITH CHECK` must prevent changing `fleet_id` on update.
- Fleet Members may insert/update vehicles only when `member_can_write` is on; they
  never get delete or restore. Soft-delete columns are protected by a trigger, and
  hard `DELETE` is denied to `app_rw`.
- Fleet Owner, Fleet Admin, and Fleet Manager operational access is permission-based;
  do not hard-code role checks in every policy.
- Finance Manager access is limited to finance permissions plus minimal
  vehicle/driver read. It never includes role, security, ownership, or operational
  write access.
- Posted financial records are never hard-deleted or silently overwritten; use
  audited reversals.
- Soft-deleted rows are hidden from normal reads; restore is a separate permission.
- `users` is not directly exposed; the API returns a limited projection (name, role,
  status) and only authorized admins see emails.
- `audit_events` is read-only for authorized fleet roles; insert via a definer
  function or the worker role.
- Revoke `EXECUTE` on helper functions from `public`; grant only to `app_rw`.
- Add isolation tests that connect as `app_rw` with fleet A context and attempt to
  select/update/delete fleet B rows by ID across vehicles, drivers, hires,
  maintenance, and finance.

## 7. Migration from Supabase

### 7.1 Inventory (before any code)

Run and record:

- Row counts: `auth.users`, `profiles`, `fleets`, `vehicles`, `notifications`.
- Profiles without `fleet_id`, vehicles without `fleet_id`, notifications without
  `fleet_id`.
- Duplicate registrations per fleet (`lower(btrim(...))`), including those that
  caused the unique index to be skipped.
- Admin counts per fleet; fleets with zero admins; profiles with no auth user.
- Vehicle `user_id` values that no longer map to a profile/auth user.
- Profiles that would map to more than one fleet (expected zero under the current
  single-`fleet_id` schema).
- Notification dedupe-key duplicates; unread counts.
- Supabase storage objects (if any), Edge Functions, cron jobs, realtime usage.
- Environment variables and external integrations.
- Confirm that current production has no driver, hire, maintenance, expense,
  income, remittance, or settlement records. If it does, inventory them before
  mapping; do not invent a source table.

### 7.2 Mapping

| Source | Target | Rule |
|---|---|---|
| `auth.users` | IdP user + `users` | Match by verified email; stable `idp_subject` |
| `profiles` | `users` + `fleet_memberships` | `admin` → `fleet_owner` (earliest) or `fleet_admin` (remaining); `member` → `fleet_member` |
| `profiles.fleet_id` | `fleets` | One fleet per distinct `fleet_id`; earliest admin becomes Fleet Owner |
| `profiles.notification_prefs` | `notification_preferences` | Normalise 7/14/30/60/90; default 30 |
| `vehicles` | `vehicles` | Require `fleet_id`; `user_id` → `created_by`; normalise registration; flag duplicates |
| `notifications` | `notifications` | Map `dedupe_key` to source/state; `is_read` → `read_at` (use `created_at` as a fallback) |
| Drivers/hires/maintenance/finance | New tables | Empty unless a source is found; no synthetic records |
| Edge Function `admin-create-user` | API invitation flow | Retire; do not port service-role user creation |
| `pg_cron` job | Worker scheduler | Reimplement; do not depend on `pg_cron` |
| Supabase Realtime | Polling/SSE | Reimplement per D-03 |

### 7.3 Transform rules

- Create fleets first, then users, then memberships, then vehicles, then
  notifications/preferences. Do not create driver, hire, maintenance, or financial
  rows during migration unless a real source is confirmed.
- Enforce the approved v1 rule: exactly one active membership per user. Fail the load
  and report the affected users if any user would receive more than one active
  membership; do not silently drop a fleet.
- Enforce exactly one active `fleet_owner` per fleet and make it match
  `fleets.owner_user_id`.
- Fail the load if any vehicle/notification has no resolvable `fleet_id`; do not
  guess.
- If a fleet has multiple admins, earliest admin is Fleet Owner; others are Fleet
  Admins.
- If a fleet has no admin, promote the earliest active member to Fleet Owner and
  record a migration audit event.
- Preserve `created_at` timestamps where present; set `updated_at` to the same value
  initially.
- Normalise registrations with `lower(btrim(...))`; report every collision; resolve
  before creating the unique index.
- Do **not** carry the legacy `status` column; derive status.
- Keep a mapping table from old IDs to new IDs for reconciliation and support.

### 7.4 Rehearsal

1. Restore a production-shaped Supabase dump into a Neon staging branch.
2. Run the transform scripts and capture timing, errors, and row counts.
3. Run verification queries and the tenant-isolation suite.
4. Run the API smoke tests against the migrated data.
5. Rehearse rollback: restore the pre-load snapshot and confirm the old app still
   works.
6. Document the runbook and the exact cutover window.

### 7.5 Cutover and rollback

- Freeze writes in the old app; announce the window.
- Take a final snapshot/PITR marker.
- Run the final delta load; verify counts and checksums.
- Switch the API/clients to the new stack; disable Supabase sign-in.
- Keep the Supabase project read-only and untouched for at least 7 days.
- Rollback: restore the snapshot, revert DNS/API to the old stack, re-enable Supabase
  auth, and reconcile any writes made after the switch. Record the decision and
  notify users.
- After the rollback window, archive the Supabase export according to the retention
  policy and decommission.

### 7.6 Verification queries (examples)

```sql
-- Row counts must match the source manifest.
select 'fleets', count(*) from fleets
union all select 'users', count(*) from users
union all select 'memberships', count(*) from fleet_memberships
union all select 'vehicles', count(*) from vehicles
union all select 'notifications', count(*) from notifications
union all select 'drivers', count(*) from drivers
union all select 'hires', count(*) from hires
union all select 'maintenance_records', count(*) from maintenance_records
union all select 'expenses', count(*) from expenses
union all select 'income_entries', count(*) from income_entries
union all select 'driver_settlements', count(*) from driver_settlements;

-- No tenantless rows.
select count(*) from vehicles where fleet_id is null;
select count(*) from notifications where fleet_id is null;
select count(*) from fleet_memberships where fleet_id is null;
select count(*) from drivers where fleet_id is null;
select count(*) from vehicle_assignments where fleet_id is null;
select count(*) from hires where fleet_id is null;
select count(*) from maintenance_records where fleet_id is null;
select count(*) from expenses where fleet_id is null;
select count(*) from income_entries where fleet_id is null;
select count(*) from driver_settlements where fleet_id is null;

-- v1 membership constraint: no user may have more than one active membership.
select user_id, count(*)
from fleet_memberships
where status = 'active'
group by 1 having count(*) > 1;

-- Exactly one active Fleet Owner per fleet.
select fleet_id, count(*)
from fleet_memberships
where role = 'fleet_owner' and status = 'active'
group by 1 having count(*) <> 1;

-- No duplicate active registrations.
select fleet_id, registration_normalized, count(*)
from vehicles
where deleted_at is null
group by 1,2 having count(*) > 1;

-- Every active fleet has an owner who is an active Fleet Owner.
select f.id
from fleets f
left join fleet_memberships m
  on m.user_id = f.owner_user_id and m.fleet_id = f.id
where f.status = 'active'
  and (m.id is null or m.role <> 'fleet_owner' or m.status <> 'active');

-- Financial detail must not be double-counted: each expense has at most one source.
select id from expenses
where fuel_purchase_id is not null and maintenance_record_id is not null;
```

## 8. Retention and deletion

Proposed defaults (confirm):

| Data | Retention | Rule |
|---|---|---|
| Vehicles | Soft-deleted 30 days, then purge | Restore available to Fleet Owner/Admin/Manager; purge audited |
| Drivers | While active + retention period after deactivation | Preserve assignment and financial history; exact period proposed |
| Assignments, hires, odometer, fuel, maintenance | Operational retention, proposed 7 years | Needed to explain financial and service history; confirm legal requirement |
| Income, expenses, ledger entries, settlements | Financial retention, proposed 7 years | Preserve posted entries; corrections by reversal; legal review required |
| Receipts/attachments | Match the owning financial record | Storage provider and deletion rules proposed |
| Notifications | 12 months after read/resolved | Unread kept until resolved or 12 months |
| Audit events | 24 months | Legal hold overrides; no app-role deletes |
| User profile | While account active + 30 days after closure | Then anonymise, keep audit references |
| Exports | Not stored | Generated on demand; audit the export event |
| Backups/PITR | Provider default + 30 days | Confirm Neon window; document restore |

Account closure must not delete shared vehicles. Transfer `created_by` to `NULL` or
to the Fleet Owner (per D-01) and retain the vehicle. It must not delete driver,
maintenance, or posted financial history; anonymise personal fields only after the
retention review.

## 9. Consequences

Positive:

- Tenant integrity is enforced by constraints, not convention.
- Membership, invitations, and audit have a proper home.
- Driver, hire, maintenance, and finance history is preserved instead of living in
  spreadsheets.
- The API can compute status, notifications, and financial summaries once,
  consistently.
- Migration is measurable and reversible.

Costs and risks:

- Many more tables and joins; the operational/finance model adds implementation and
  migration work.
- RLS policies are more complex; they need permission helpers and tests.
- The financial model needs owner/accounting review. A toy ledger would be worse than
  a documented, limited operational summary.
- Finance Manager and Fleet Owner role details are not signed; building them early
  risks rework.
- Keeping date columns rather than a documents table limits renewal history to audit
  events; revisit in Phase 4.
- Retention/anonymisation and financial record retention need legal review.
- Legacy duplicates and orphan rows may require product decisions before load.

## 10. Decision requested

**Already approved (25 October 2026):** one active fleet membership per user in
v1, enforced by the partial unique index and the fail-closed API rule in §3.3 and
§6.1. The D-01 vehicle permission rule is also approved: Fleet Members add/edit but
never delete/restore; Fleet Managers and Fleet Admins delete. §6.2 is written to
enforce that rule. The remaining items below are **Proposed** and open.

1. Approve the target tables and constraints in §3, including the new driver,
   assignment, hire, odometer, fuel, maintenance, expense, income, ledger,
   settlement, attachment, and availability tables.
2. Approve the Fleet Owner and Finance Manager schema rules: one active owner,
   owner-user consistency, role enum, and delegation boundaries (D-01).
3. Approve the permission catalog and the `app.permissions` RLS context, or choose a
   database-backed role/permission table instead.
4. Confirm the operational workflow: assignments, active hire uniqueness, vehicle
   status precedence, and whether customer/booking fields are in v1.
5. Confirm the financial rules: 10-day settlement cycle, daily entry meaning, ZMW
   and other currencies, expense categories, receipt requirements, correction and
   reversal rules, and whether a double-entry ledger is required.
6. Approve the "four date columns in v1" document model (with audit-based history),
   or choose a `vehicle_documents` table now.
7. Approve fleet timezone + document status and operational status precedence in §4.
8. Approve the notification lifecycle and worker as the single source of truth.
9. Approve the RLS context model (`app_rw`, `FORCE RLS`, `SET LOCAL`,
   `app.permissions`).
10. Approve audit retention (24 months), the event list in D-01, and the
    Super Admin cross-fleet read audit.
11. Approve soft delete/retention, including driver and financial retention.
12. Approve the migration/rehearsal/rollback plan and the cutover window.
13. Confirm how to resolve legacy duplicates, fleets without an admin, and the
    earliest-admin-to-Fleet-Owner mapping.

## 11. Sign-off

| Item | Decision | Date | Notes |
|---|---|---|---|
| Schema/tables | | | Includes proposed operational and financial tables |
| Fleet Owner/Finance Manager schema | | | Proposed role enum, owner uniqueness, delegation |
| Operational records | | | Drivers, assignments, hires, mileage, fuel, maintenance |
| Financial records | | | Expenses, income, ledger, settlements; exact accounting rules proposed |
| Permission catalog | | | `app.permissions`; alternative DB-backed model proposed |
| Finance rules | | | 10-day cycle, ZMW, categories, receipts, reversals |
| Document model | | | |
| Status/timezone | | | Document and operational status |
| Notification lifecycle | | | |
| RLS context | | | |
| Audit retention | | | |
| Soft delete/retention | | | Includes drivers and financial records |
| Migration plan | | | New tables empty unless a source is confirmed |
