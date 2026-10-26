export const FLEET_ROLES = [
  "fleet_owner",
  "fleet_admin",
  "fleet_manager",
  "finance_manager",
  "fleet_member",
  "read_only",
] as const;

export type FleetRole = (typeof FLEET_ROLES)[number];

export const PERMISSIONS = [
  "fleet.profile.read",
  "fleet.settings.manage",
  "fleet.members.read",
  "fleet.members.manage",
  "fleet.audit.read",
  "fleet.vehicles.read",
  "fleet.vehicles.create",
  "fleet.vehicles.update",
  "fleet.vehicles.delete",
  "fleet.vehicles.restore",
  "fleet.operations.read",
  "fleet.operations.manage",
  "finance.context.read",
  "finance.expenses.read",
  "finance.expenses.manage",
  "finance.income.read",
  "finance.income.manage",
  "finance.remittances.read",
  "finance.remittances.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface FleetPolicy {
  memberCanWrite: boolean;
  memberCanExport: boolean;
  readonlyCanExport: boolean;
  managerCanManageMembers: boolean;
  managerCanAssignManager: boolean;
}

export const DEFAULT_FLEET_POLICY: FleetPolicy = Object.freeze({
  memberCanWrite: true,
  memberCanExport: true,
  readonlyCanExport: false,
  managerCanManageMembers: false,
  managerCanAssignManager: false,
});

const OPERATIONS_AND_VEHICLES: readonly Permission[] = [
  "fleet.profile.read",
  "fleet.vehicles.read",
  "fleet.vehicles.create",
  "fleet.vehicles.update",
  "fleet.vehicles.delete",
  "fleet.vehicles.restore",
  "fleet.operations.read",
  "fleet.operations.manage",
];

const FINANCE_READ: readonly Permission[] = [
  "finance.context.read",
  "finance.expenses.read",
  "finance.income.read",
  "finance.remittances.read",
];

const FINANCE_MANAGE: readonly Permission[] = [
  "finance.expenses.manage",
  "finance.income.manage",
  "finance.remittances.manage",
];

const ROLE_PERMISSIONS: Readonly<Record<FleetRole, readonly Permission[]>> = {
  fleet_owner: Object.freeze([
    "fleet.profile.read",
    "fleet.settings.manage",
    "fleet.members.read",
    "fleet.members.manage",
    "fleet.audit.read",
    "fleet.vehicles.read",
    "fleet.vehicles.create",
    "fleet.vehicles.update",
    "fleet.vehicles.delete",
    "fleet.vehicles.restore",
    "fleet.operations.read",
    "fleet.operations.manage",
    ...FINANCE_READ,
    ...FINANCE_MANAGE,
  ]),
  fleet_admin: Object.freeze([
    "fleet.profile.read",
    "fleet.settings.manage",
    "fleet.members.read",
    "fleet.members.manage",
    "fleet.audit.read",
    ...OPERATIONS_AND_VEHICLES,
  ]),
  fleet_manager: Object.freeze(["fleet.profile.read", ...OPERATIONS_AND_VEHICLES]),
  finance_manager: Object.freeze([
    "fleet.profile.read",
    ...FINANCE_READ,
    ...FINANCE_MANAGE,
  ]),
  fleet_member: Object.freeze([
    "fleet.profile.read",
    "fleet.vehicles.read",
    "fleet.vehicles.create",
    "fleet.vehicles.update",
  ]),
  read_only: Object.freeze(["fleet.profile.read", "fleet.vehicles.read"]),
};

export function isFleetRole(value: string): value is FleetRole {
  return (FLEET_ROLES as readonly string[]).includes(value);
}

export function permissionsForRole(role: FleetRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
): boolean {
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: readonly string[],
  required: readonly Permission[],
): boolean {
  return required.some((permission) => permissions.includes(permission));
}

/**
 * Fleet policy is stored as JSONB. Missing or malformed values use the documented
 * defaults; a non-boolean value never turns a permission on.
 */
export function normalizeFleetPolicy(raw: unknown): FleetPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_FLEET_POLICY };
  }

  const value = raw as Record<string, unknown>;
  return {
    memberCanWrite:
      typeof value.member_can_write === "boolean"
        ? value.member_can_write
        : DEFAULT_FLEET_POLICY.memberCanWrite,
    memberCanExport:
      typeof value.member_can_export === "boolean"
        ? value.member_can_export
        : DEFAULT_FLEET_POLICY.memberCanExport,
    readonlyCanExport:
      typeof value.readonly_can_export === "boolean"
        ? value.readonly_can_export
        : DEFAULT_FLEET_POLICY.readonlyCanExport,
    managerCanManageMembers:
      typeof value.manager_can_manage_members === "boolean"
        ? value.manager_can_manage_members
        : DEFAULT_FLEET_POLICY.managerCanManageMembers,
    managerCanAssignManager:
      typeof value.manager_can_assign_manager === "boolean"
        ? value.manager_can_assign_manager
        : DEFAULT_FLEET_POLICY.managerCanAssignManager,
  };
}
