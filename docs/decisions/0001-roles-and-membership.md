# D-01 — Roles, permissions, membership, and Super Admin boundaries

**Status:** Partially accepted — membership model and vehicle permissions approved
25 October 2026; all other items remain proposed
**Date:** 25 October 2026
**Owner:** Najma Mustafa (product owner)
**Covers:** PRD v0.3 §6, §7.1–§7.8, §11, §16 (role matrix, Fleet Manager/Member
actions, Fleet Owner, Finance Manager, Super Admin boundaries, legacy mapping)
**Depends on:** D-02 (identity provider) for invitation and MFA mechanics
**Blocks:** D-04 (schema), Phase 1 authorization, migration mapping

## 1. Context

The current app has two roles on `profiles`: `admin` and `member`
(`supabase/schema.sql:34`). Fleet membership is a single `profiles.fleet_id`, with
no status, invitation, suspension, or removal state. Any member can create, edit,
and delete vehicles because the RLS policies check only `fleet_id`
(`supabase/schema.sql:565-579`). There is no platform role, no MFA, and no audit
trail.

The PRD requires six fleet roles plus a separate platform Super Admin, strict least
privilege, last-owner/last-admin protection, and a non-elevating migration. This
decision defines the model precisely enough to build the schema, API, and UI.

**PRD v0.3 reconciliation (Proposed):** PRD v0.3 adds a **Fleet Owner**, a
**Finance Manager**, a developer **Super Admin** with audited cross-fleet read
access, owner-entered driver activity, and vehicle/maintenance/finance records.
This revision reconciles D-01 with v0.3. New details are marked **Proposed**; only
the membership model and the previously signed vehicle-permission rule remain
accepted.

## 2. Decision summary (proposed)

1. Authorization has **platform**, **fleet**, and **module** scopes.
2. Fleet roles are **Fleet Owner**, **Fleet Admin**, **Fleet Manager**, **Finance
   Manager**, **Fleet Member**, and **Read-only Member**.
3. **Super Admin (developer)** is a platform role stored separately from fleet
   memberships. It has no fleet role. It uses a separate MFA-protected account and
   may read fleet and financial data across fleets for development/support, with
   every cross-fleet read audited. Writes and elevated support actions require a
   separate permission and audit. Details are **Proposed** in §8.
4. A user may hold **one active fleet membership in v1** (approved 25 October
   2026). The schema uses a `fleet_memberships` table so multi-fleet can be enabled
   later without a rewrite.
5. Fleet membership has a lifecycle: `invited → active → suspended → removed`.
6. A fleet has exactly one active **Fleet Owner**. Ownership transfer is an audited
   two-step flow. Fleet Admins are delegated administrators and cannot take
   ownership.
7. The Fleet Owner cannot be demoted, suspended, removed, or deleted without first
   transferring ownership. The last active Fleet Admin is also protected.
8. Legacy `admin` maps to Fleet Owner (earliest admin) or Fleet Admin (remaining
   admins); legacy `member` maps to Fleet Member. No one becomes Super Admin. No
   one gains a privilege they do not have today, with one deliberate exception:
   vehicle deletion is removed from the Fleet Member role in v1 (see §7).
9. Vehicle writes: the previously approved rule is Fleet Admins and Fleet Managers
   may create, edit, delete, and restore; Fleet Members may create and edit but
   **never delete or restore**; Read-only Members have no vehicle writes. The Fleet
   Owner is **proposed** to have full fleet access, including vehicle
   delete/restore. Super Admin has no vehicle writes.
10. A **Driver record** is a fleet-scoped profile, not an app role in v1. The owner
    or an authorized manager maintains driver details and records assignments,
    hires, mileage, and activity. Drivers do not sign in in v1.
11. A **Finance Manager** works only in the finance module: earnings, remittances,
    settlements, fuel/maintenance expenses, receipts, and financial reports. They
    may read the minimum vehicle/driver context needed to associate records, but
    cannot manage roles, security, ownership, or operational vehicle records.
12. Authorization uses a centralized, extensible permission catalog. The API and
    RLS default to deny when a permission is absent; UI gating is not authorization.
13. Operational records (vehicles, drivers, assignments, hires, mileage, fuel,
    maintenance) and financial records (income, expenses, ledger entries,
    settlements) remain separate. Exact accounting rules are **Proposed** in D-04.

## 3. Role definitions

### 3.1 Super Admin (developer) — platform scope (Proposed v0.3)

**Purpose:** Operate the platform and provide development/support with audited
cross-fleet visibility.
**Not:** a hidden shared account, an impersonation tool, or a default writer.

Allowed by default (**Proposed**):

- Read fleet and financial data across fleets for development and support: fleet
  profile, vehicles, drivers, assignments, hires, expenses, income, settlements,
  maintenance, and reports.
- View platform configuration and tenant metadata.
- Create, suspend, or close fleets and platform administrators, subject to audit.
- Grant and revoke time-bound elevated support access.

Required controls:

- A separate account, never a business owner account; MFA is mandatory before
  activation.
- Every cross-fleet read and every privileged action is audited with actor, fleet,
  purpose, time, and correlation ID.
- No write access to fleet data by default. Writes and elevated support actions
  require a separate permission and audit; the approval, duration, and tenant
  notification rules are **Proposed** in §8.
- No impersonation, no session minting, no hidden service credential in a client.
- Cannot grant itself fleet membership.

### 3.2 Fleet Owner (Proposed)

- Exactly one active Fleet Owner per fleet; the role is fleet-scoped, not platform.
- Full access to the owner's fleet: vehicles, drivers, assignments, hires,
  mileage, fuel, maintenance, expenses, income, settlements, reports, roles, and
  settings.
- May grant Fleet Admin, Fleet Manager, Finance Manager, Fleet Member, and Read-only
  Member roles. Ownership itself changes only through the two-step transfer flow,
  not through an ordinary role assignment.
- Cannot grant Super Admin or any platform role.
- Cannot be demoted, suspended, removed, or deleted until ownership is transferred.
- Cannot access another fleet. One active fleet membership per user still applies
  in v1.

### 3.3 Fleet Admin (fleet scope)

- Manage fleet operations and members within permissions granted by the Fleet Owner.
- May be more than one per fleet, but cannot take or share ownership.
- Cannot grant Super Admin, change ownership, or remove the Fleet Owner.
- Financial access is limited to permissions explicitly granted by the Fleet Owner
  (**Proposed**).
- May manage vehicles, drivers, assignments, hires, mileage, fuel, maintenance, and
  reports according to the permission catalog.

### 3.4 Fleet Manager (fleet scope)

- Manage vehicles, drivers, assignments, hire/dispatch, mileage, fuel, and
  maintenance.
- Financial access is limited to permissions assigned by the Fleet Owner. Default:
  no access to income, remittances, settlements, or financial reports
  (**Proposed**).
- May invite Fleet Members and Read-only Members only if the Fleet Owner or an
  authorized Fleet Admin grants the permission. Default: off.
- Cannot change fleet ownership, grant platform roles, or manage security settings.

### 3.5 Finance Manager (fleet / finance module — Proposed)

- View and manage earnings, remittances/settlements, fuel and maintenance expenses,
  receipts, and financial reports.
- May read the minimum vehicle and driver details needed to associate financial
  records; no operational vehicle or driver writes.
- Cannot manage roles, members, fleet security, ownership, or platform roles.
- Create/update financial records and correct them through audited reversals; no
  hard delete of posted financial history.
- Exact create/update/export permissions, receipt requirements, and reversal rules
  are **Proposed** and must be signed before implementation.

### 3.6 Fleet Member (fleet scope)

- View fleet vehicles, dashboard, reports, notifications, and team directory.
- Create and edit vehicles. The `member_can_write` fleet policy may restrict this
  (default: on); it cannot grant delete.
- Export reports **if** fleet policy `member_can_export` is on (default: on,
  preserving current behavior).
- **Cannot delete or restore vehicles in v1** (approved 25 October 2026). Delete and
  restore are restricted to Fleet Managers, Fleet Admins, and the proposed Fleet
  Owner.
- No access to financial records, driver administration, or fleet settings.
- Cannot manage members, roles, settings, or ownership.
- Cannot assign any role.

### 3.7 Read-only Member (fleet scope)

- View permitted fleet records, notifications, and reports.
- Cannot create, edit, delete, export, invite, or administer by default.
- The Fleet Owner or an authorized Fleet Admin may grant `readonly_can_export`
  (default: off).
- Cannot see audit logs, financial records, or member management controls.

### 3.8 Driver record (not an app role in v1)

- A fleet-scoped profile maintained by the Fleet Owner or an authorized manager.
- Holds only the personal and licence information the business needs, plus
  active/inactive status and notes.
- Driver assignments, hire/dispatch activity, mileage, and financial entries are
  recorded by the owner or an authorized manager; drivers have no login or app
  account in v1.
- Assignment and activity history is preserved when a driver becomes inactive.
- A separate driver login is a future decision and must not be assumed in v1.

### 3.9 Fleet policy (v1, Proposed except member delete)

Stored on the fleet, editable only by the Fleet Owner or an authorized Fleet Admin,
audited:

| Policy | Default | Effect |
|---|---|---|
| `member_can_write` | `true` | Fleet Members may create/edit vehicles (may only restrict, never grant delete) |
| `member_can_export` | `true` | Fleet Members may export CSV/PDF |
| `readonly_can_export` | `false` | Read-only Members may export |
| `manager_can_manage_members` | `false` | Fleet Managers may invite Member/Read-only |
| `manager_can_assign_manager` | `false` | Fleet Managers may assign Fleet Manager |

Defaults preserve current member ability to create/edit/export, while removing
delete. **Approved 25 October 2026:** member delete is not a policy option in v1;
it is denied by role. A Fleet Owner or authorized Fleet Admin may use
`member_can_write` to make a fleet stricter, but no policy can grant a Fleet Member
delete. Removing delete is the one intentional access reduction and must be
communicated before cutover.

Finance access is controlled by the permission catalog and the Fleet Owner's
grants, not by widening these existing flags. Adding finance-specific policy flags
is **Proposed** and must not be assumed in v1.

## 4. Capability matrix (PRD v0.3 reconciliation)

All rows in this matrix are **Proposed** except the previously approved vehicle
permission rule for Fleet Admins, Fleet Managers, Fleet Members, and Read-only
Members. The Fleet Owner and Finance Manager columns are new and unconfirmed.

Legend: **Yes** = allowed; **No** = denied; **Policy** = allowed only when the
permission or fleet policy is granted; **Self** = only the user's own
record/preferences; **Audited** = read is logged; **Minimal** = only the minimum
fields needed for the related task; **Limited** = only fleet-level events relevant
to the role; **Finance reports** = financial reports only; **Grant** = separate
audited platform grant.

| Action | Super Admin (developer) | Fleet Owner | Fleet Admin | Fleet Manager | Finance Manager | Fleet Member | Read-only |
|---|---|---|---|---|---|---|---|
| View platform health/config | Yes | No | No | No | No | No | No |
| Cross-fleet fleet/financial data | Yes (audited) | No | No | No | No | No | No |
| View fleet profile/settings | Yes (audited) | Yes | Yes | Yes | Minimal | Yes | Yes |
| View vehicles | Yes (audited) | Yes | Yes | Yes | Minimal | Yes | Yes |
| View driver records | Yes (audited) | Yes | Yes | Yes | Minimal | No | No |
| View financial records | Yes (audited) | Yes | Policy | Policy | Yes | No | No |
| View reports | Yes (audited) | Yes | Yes | Yes | Finance reports | Yes | Yes |
| Export CSV/PDF | No | Yes | Policy | Policy | Policy | Policy | Policy |
| Create/edit vehicle | No | Yes | Yes | Yes | No | Policy | No |
| Delete/restore vehicle | No | Yes | Yes | Yes | No | No | No |
| Manage drivers | No | Yes | Yes | Yes | No | No | No |
| Manage driver/vehicle assignments | No | Yes | Yes | Yes | No | No | No |
| Record hire/dispatch and odometer | No | Yes | Yes | Yes | No | No | No |
| Record fuel usage | No | Yes | Yes | Yes | No | No | No |
| Manage maintenance work records | No | Yes | Yes | Yes | No | No | No |
| Manage expenses and receipts | No | Yes | Policy | Policy | Yes | No | No |
| Manage income, remittances, settlements | No | Yes | Policy | Policy | Yes | No | No |
| Reverse posted financial entries | No | Yes | Policy | No | Yes | No | No |
| View audit log | Yes (audited) | Yes | Yes | Limited | No | No | No |
| Invite/manage members | No | Yes | Policy | Policy | No | No | No |
| Assign Finance Manager | No | Yes | Policy | No | No | No | No |
| Assign Fleet Manager | No | Yes | Policy | Policy | No | No | No |
| Assign Fleet Admin | No | Yes | No | No | No | No | No |
| Transfer ownership | No | Yes | No | No | No | No | No |
| Edit fleet settings/security | No | Yes | Policy | No | No | No | No |
| Manage own preferences | No | Self | Self | Self | Self | Self | Self |
| Cross-fleet write/support | Grant | No | No | No | No | No | No |
| Create/close fleet | Yes | No | No | No | No | No | No |
| Grant Super Admin | Existing Super Admin only | No | No | No | No | No | No |

Notes:

- **Approved 25 October 2026 — vehicle permissions:** Fleet Admins and Fleet
  Managers may create, edit, delete, and restore. Fleet Members may create and edit
  but never delete or restore; `member_can_write` may only restrict their
  create/edit access. Read-only Members have no vehicle writes. The Fleet Owner is
  **proposed** to have the same full vehicle access as a Fleet Admin.
- **Proposed:** Finance Manager is a module role. It gets finance permissions plus
  minimal read access to vehicles and drivers; it never gets role, security,
  ownership, or operational write access.
- **Proposed:** Fleet Owner is not a platform role and cannot access another fleet.
  The owner may grant fleet roles except Super Admin; ownership transfer is a
  separate two-step flow.
- **Proposed:** Super Admin read access is cross-fleet and audited. It has no
  default fleet writes; elevated support actions require a separate grant.
- A user with multiple memberships (future) would have a role per fleet; v1 has one
  active membership.
- This matrix must be signed before Phase 1 authorization code is considered final.

## 5. Membership model

### 5.1 Schema shape

A `fleet_memberships` table, not `profiles.fleet_id`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Primary key |
| `fleet_id` | uuid | `NOT NULL`, FK → `fleets(id)` `ON DELETE RESTRICT` |
| `user_id` | uuid | `NOT NULL`, FK → `users(id)` `ON DELETE RESTRICT` |
| `role` | enum | `fleet_owner`, `fleet_admin`, `fleet_manager`, `finance_manager`, `fleet_member`, `read_only` |
| `status` | enum | `invited`, `active`, `suspended`, `removed` |
| `invited_by` | uuid | Nullable, FK → `users(id)` `ON DELETE SET NULL` |
| `invited_at` | timestamptz | Nullable |
| `joined_at` | timestamptz | Nullable |
| `suspended_at` | timestamptz | Nullable |
| `removed_at` | timestamptz | Nullable |
| `created_at` | timestamptz | Default now |
| `updated_at` | timestamptz | Default now |

Constraints:

- `UNIQUE (fleet_id, user_id)` for the membership record.
- Partial unique index `(user_id) WHERE status = 'active'` to enforce one active
  fleet in v1.
- Partial unique index `(fleet_id) WHERE role = 'fleet_owner' AND status = 'active'`
  to enforce exactly one active Fleet Owner per fleet (**Proposed**).
- `fleets.owner_user_id` must point to the same user as the active `fleet_owner`
  membership. Enforce through the ownership-transfer transaction and a verification
  query; do not allow the two to drift (**Proposed**).
- `fleet_owner` is not an invitation role. It is assigned only through the ownership
  transfer flow. `finance_manager` may be invited by the Fleet Owner or an
  authorized Fleet Admin (**Proposed**).
- A removed/suspended membership keeps the row for audit; it is never hard-deleted.
- Re-inviting a removed user reactivates the same row (new invite token) and is
  audited.

### 5.2 Invitation lifecycle

`invited → active` on acceptance; `active → suspended` by the Fleet Owner or an
authorized Fleet Admin; `suspended → active` by the Fleet Owner or an authorized
Fleet Admin; `active/suspended → removed` by the Fleet Owner or an authorized Fleet
Admin. The Fleet Owner cannot be suspended or removed without transferring
ownership first. Invitations expire after 7 days; expired invitations can be resent.
Only one pending invitation per email per fleet.

Finance Manager invitations and role assignments are **Proposed**; the Fleet Owner
should be the default grantor, with Fleet Admin delegation optional.

Because v1 allows one active membership, accepting an invitation, reinstating a
suspended membership, or transferring a user into another fleet must first check for
an existing active membership. If one exists, return a clear message: "You already
belong to a fleet. Ask an admin to remove you before joining another." The API must
not silently move the user or create a second active row.

Provider-managed invitation links are preferred (D-02). If the provider cannot
invite, the API creates a single-use token with a short expiry and sends it through
the selected email provider. Do not send or display a plaintext temporary password.

### 5.3 Membership changes and records

- Member removal never deletes vehicles, drivers, assignments, maintenance, or
  financial records. `created_by`/`updated_by` references become `NULL` or retain an
  audited reference with `ON DELETE SET NULL`.
- The Fleet Owner role cannot be removed or suspended until ownership is transferred.
- The removed user loses access immediately; existing sessions are revoked (D-02).
- If a user has no active membership, the app shows a recovery screen with "Contact
  your fleet owner or admin" and a support link. It must not show a raw database
  error.

### 5.4 Approved v1 constraint and expansion path

**Approved 25 October 2026:** v1 allows one active fleet membership per user. The
schema remains expandable to multiple memberships later without a table rewrite.

How the constraint is enforced:

- The partial unique index `(user_id) WHERE status = 'active'` is the database
  backstop.
- The API loads the caller's single active membership for every request. If it finds
  zero, it returns the recovery path. If it finds more than one (a data bug), it
  fails closed and logs an error; it never guesses a fleet.
- The invitation and reinstatement flows check for an existing active membership
  before activation.
- The membership row is retained when a user is suspended or removed, so history and
  audit remain intact. Only `active` is unique.

What "expandable later" means:

1. Drop the partial unique index (a forward migration).
2. Allow a user to hold active memberships in more than one fleet.
3. Add an explicit active-fleet context: a fleet switcher in the client and either
   an `active_fleet_id` session claim or a validated `X-Fleet-Id` request header.
4. Resolve that context against `fleet_memberships` on every request and set
   `app.fleet_id` from it. Audit fleet switches.
5. Update RLS and API tests to cover multiple memberships.

No table redesign, data copy, or ID change is needed for that expansion. The
`fleet_memberships` table, per-fleet roles, and per-fleet notification keys already
support it. The main work is the active-fleet selection UX and the authorization
tests.

## 6. Fleet ownership (Proposed v0.3)

- `fleets.owner_user_id` references the user who owns the fleet; the owner must hold
  an active `fleet_owner` membership in that fleet.
- A fleet may have multiple Fleet Admins but exactly one active Fleet Owner.
- Because v1 allows one active membership per user, the owner cannot be an active
  member of another fleet. Suspending, removing, or demoting the owner is blocked
  until ownership is transferred.
- Ownership transfer is two-step: the owner initiates, the target accepts. Until
  acceptance, the current owner keeps ownership. Both steps are audited and both
  users are notified in-app.
- Platform support may transfer ownership only through a separately permissioned,
  audited support action with a recorded reason and tenant notification.
- Owner protection:
  - the Fleet Owner cannot be demoted, suspended, removed, or deleted without a
    completed transfer;
  - a fleet cannot be left with no active Fleet Owner.
- Last-admin protection:
  - demotion, suspension, removal, and account deletion are blocked when the target
    is the last active Fleet Admin;
  - vehicle/data deletion is never used to resolve the block;
  - the API returns a plain-language message: "This is the only fleet admin.
    Promote another member before changing this role."

**PRD wording ambiguity (Proposed):** PRD v0.3 §7.1 says the first account becomes
the fleet's Fleet Admin, and §7.2 says fleet settings are editable only by Fleet
Admins. D-01 treats the first account as the **Fleet Owner** and the owner as having
full settings access; Fleet Admins are delegated. Confirm this interpretation and
correct the PRD wording in the next version.

## 7. Legacy role mapping (Proposed v0.3)

| Current role | New role | Rationale | Privilege change |
|---|---|---|---|
| `admin` | Fleet Owner (earliest admin) | Only role that can currently manage the fleet; one owner is required | None; gets owner-only controls such as ownership transfer |
| `admin` | Fleet Admin (remaining admins) | Keeps delegated fleet administration without ownership | None; cannot take ownership or grant Super Admin |
| `member` | Fleet Member | Current members can view and write vehicles | Keeps create/edit/export; **loses delete** (fixed in v1) |
| n/a | Fleet Manager | New role | None |
| n/a | Finance Manager | New module role | None; not mapped from legacy roles |
| n/a | Read-only Member | New role | None |
| n/a | Driver record | Fleet profile, not an app role | None; drivers do not sign in |
| n/a | Super Admin | New platform role | None; never auto-granted |

Rules:

- If a fleet has multiple admins, the earliest-created admin becomes the Fleet Owner;
  the others become Fleet Admins. This mapping is **Proposed** and must be signed.
- If a fleet has no admin, the earliest active member is promoted to Fleet Owner,
  with an audit event and a migration report line.
- Fleet Owners and authorized Fleet Admins may assign the Finance Manager role after
  cutover. No legacy user is mapped to Finance Manager automatically.
- Fleet Owners and authorized Fleet Admins may downgrade members to Read-only after
  cutover; this is not done automatically.
- The migration must produce a before/after capability diff per user and require
  owner sign-off.
- No user is mapped to Super Admin. The first Super Admin is created manually by the
  product owner after MFA enrolment.

**Approved 25 October 2026:** Fleet Members do not get vehicle delete in v1. Fleet
Managers and Fleet Admins delete and restore. This is the one intentional access
reduction, because delete is destructive and the PRD's examples for Fleet Member are
add and update. Communicate the change in the migration notice and show it in the
before/after capability diff.

## 8. Super Admin and support access

### 8.1 Platform administration

- Stored in `platform_admins` (`user_id`, `status`, `mfa_enrolled_at`,
  `created_by`, timestamps), separate from `fleet_memberships`.
- MFA is mandatory (TOTP or WebAuthn). Enrolment is required before activation.
- Recovery uses backup codes plus approval by a second platform admin; recovery is
  audited.
- No Super Admin may hold a fleet membership that would create a conflict of
  interest without owner approval and an audit note.

### 8.2 Default audited cross-fleet read (Proposed v0.3)

PRD v0.3 explicitly allows the developer Super Admin to view fleet and financial
data across fleets for development/support. That read is:

- read-only;
- available only through the platform administration surface, never a normal fleet
  session;
- logged for every access with actor, fleet, data type, purpose, timestamp,
  correlation ID, IP, and user agent;
- subject to MFA and a separate platform account;
- not an export permission by default; exports require a separate grant and audit.

The exact read scope, whether a reason is required for every read or only for
sensitive records, the retention of read logs, and whether tenants are notified are
**Proposed** and must be confirmed. The default must never be a hidden or shared
backdoor.

### 8.3 Elevated support and write access (Proposed)

Any write, impersonation-free support intervention, export, or access beyond the
default read requires a time-bound grant:

1. Step-up MFA and a second factor confirmation.
2. A reason and a support ticket reference.
3. A scope: specific fleet, specific record types, and read/write/export.
4. Duration: maximum 60 minutes; auto-expiry; manual revoke.
5. Tenant notification: the Fleet Owner and all Fleet Admins receive an in-app and
   (when email exists) email notice that elevated access was granted. Exact timing
   is **Proposed**.
6. Audit: start, end, scope, reason, ticket, actor, IP, user agent, records viewed
   or changed.
7. No impersonation, no session minting. A support session displays a persistent
   banner.
8. Emergency access without tenant approval requires platform-owner plus security
   approval and is reviewed within 24 hours.

### 8.4 Audit events for this decision

`fleet.created`, `fleet.updated`, `fleet.owner_transferred`, `member.invited`,
`member.accepted`, `member.role_changed`, `member.suspended`, `member.reinstated`,
`member.removed`, `policy.updated`, `vehicle.created`, `vehicle.updated`,
`vehicle.deleted`, `vehicle.restored`, `driver.created`, `driver.updated`,
`driver.deactivated`, `assignment.created`, `assignment.ended`, `hire.started`,
`hire.completed`, `odometer.recorded`, `fuel.recorded`, `maintenance.recorded`,
`expense.recorded`, `expense.reversed`, `income.recorded`, `income.reversed`,
`remittance.recorded`, `settlement.closed`, `export.created`,
`superadmin.read`, `support.access_started`, `support.access_ended`,
`platform_admin.created`, `platform_admin.suspended`, `mfa.enrolled`, `mfa.reset`.
Each includes actor, target, fleet, timestamp, source IP/user agent, correlation ID,
and reason where applicable.

## 9. Enforcement model

Authorization is checked in this order:

1. **Identity** — verify the session/JWT with the identity provider (D-02).
2. **Membership** — load the caller's membership for the target fleet from the
   database. Never trust a client-supplied `fleet_id` or role.
3. **Permission** — evaluate the centralized permission catalog and fleet policy.
   Permissions cover module actions such as `fleet.vehicles.edit`,
   `fleet.drivers.manage`, `finance.expenses.manage`, and
   `finance.settlements.read`. Default is deny.
4. **Ownership** — verify the target row belongs to the fleet (and, for writes,
   that the caller may modify that row).
5. **Database** — RLS repeats the fleet, permission, and role checks as defense in
   depth.
6. **Audit** — write the required event in the same transaction for sensitive
   actions.

The client may hide controls for usability, but the API and database are the
authority. No endpoint may accept a role or `fleet_id` from the request body as
authorization input. The permission catalog is versioned with the API; adding a
module must declare its permissions and data ownership rather than scattering role
name checks through the client.

## 10. Consequences

Positive:

- Removes the current "any member can delete anything" risk.
- Adds a clear business owner and a finance-only role without granting fleet
  administration.
- Enables invitations, suspension, removal, and read-only access without a rewrite.
- Gives the developer Super Admin a defensible, audited cross-fleet read boundary.
- Keeps migration privilege-neutral except for the documented delete reduction.

Costs and trade-offs:

- More roles, permissions, and joins than `profiles.fleet_id`.
- Invitation and ownership-transfer flows add UI and email/provider work.
- The permission catalog and Finance Manager module add design and test surface.
- The developer Super Admin read policy needs its own audit, purpose, and review
  controls; it must not become a backdoor.
- Fleet policy adds configuration surface; keep v1 flags minimal.

## 11. Decision requested

Please confirm or amend:

1. **Proposed:** role names — Fleet Owner, Fleet Admin, Fleet Manager, Finance
   Manager, Fleet Member, Read-only Member; Super Admin is platform-only.
2. **Approved 25 October 2026:** vehicle permissions — Fleet Members may add/edit
   but not delete/restore; Fleet Managers and Fleet Admins may delete. The remaining
   matrix items (exports, member management, settings, Fleet Owner, Finance Manager)
   still need sign-off.
3. **Approved 25 October 2026:** one active fleet per user in v1, with
   `fleet_memberships` ready for more (see §5.4).
4. **Proposed:** legacy mapping — `admin` → Fleet Owner (earliest) or Fleet Admin
   (remaining); `member` → Fleet Member; no legacy Finance Manager; Fleet Members
   lose vehicle delete in v1 (fixed, not a policy flag).
5. **Proposed:** Fleet ownership — exactly one active Fleet Owner per fleet,
   explicit `owner_user_id`, two-step transfer, owner cannot be demoted without
   transfer. Confirm that the first account and settings authority described as
   "Fleet Admin" in PRD §7.1/§7.2 mean the Fleet Owner.
6. **Proposed:** Fleet Owner and Fleet Admin delegation boundaries, including
   whether Fleet Admins may grant Finance Manager or manage finance.
7. **Proposed:** Finance Manager permissions — finance records and reports, minimal
   vehicle/driver read, no roles/security/ownership/operational writes; exact
   create/update/export/reversal rules.
8. **Proposed:** Super Admin (developer) default audited cross-fleet read access,
   plus the separate elevated-support/write grant, purpose logging, tenant
   notification, and duration.
9. **Proposed:** owner/authorized-manager-entered driver activity; drivers have no
   login in v1.
10. **Proposed:** operational and financial records in D-04, including the exact
    settlement cycle, currency, expense categories, receipt rules, and correction
    model.
11. Fleet creation is approved onboarding (see D-06 for the mechanism).
12. Audit retention of 24 months (D-04 confirms).
13. Whether Fleet Managers may invite members by default (recommendation: off until
    granted).

## 12. Sign-off

| Item | Decision | Owner | Date | Notes |
|---|---|---|---|---|
| Role names | | | | |
| Fleet Owner role | | | | Proposed in PRD v0.3 reconciliation; not yet signed |
| Finance Manager role | | | | Proposed in PRD v0.3 reconciliation; not yet signed |
| Super Admin developer access | | | | Proposed audited cross-fleet read; elevated support rules pending |
| Driver activity | | | | Proposed owner/authorized-manager entry; no driver login in v1 |
| Vehicle permissions | **Accepted** — Fleet Members add/edit, no delete/restore; Fleet Managers and Admins delete | Najma Mustafa | 2026-10-25 | Partial approval of the capability matrix; other rows remain proposed |
| Capability matrix | | | | |
| Membership model | **Accepted** — one active fleet per user in v1; `fleet_memberships` designed for multi-fleet later | Najma Mustafa | 2026-10-25 | Partial approval of D-01; role names, remaining matrix, legacy mapping, ownership, and Super Admin policy remain pending |
| Legacy mapping | | | | |
| Ownership model | | | | |
| Super Admin policy | | | | |
| Audit retention | | | | |
