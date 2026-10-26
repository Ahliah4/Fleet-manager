import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLEET_POLICY,
  hasPermission,
  normalizeFleetPolicy,
  permissionsForRole,
} from "../src/domain/permissions.js";

describe("role permissions", () => {
  it("gives Fleet Owner full fleet and finance access", () => {
    const permissions = permissionsForRole("fleet_owner");
    expect(hasPermission(permissions, "fleet.vehicles.delete")).toBe(true);
    expect(hasPermission(permissions, "fleet.operations.manage")).toBe(true);
    expect(hasPermission(permissions, "finance.expenses.manage")).toBe(true);
    expect(hasPermission(permissions, "fleet.members.manage")).toBe(true);
  });

  it("gives Fleet Member add/edit but not delete or restore", () => {
    const permissions = permissionsForRole("fleet_member");
    expect(hasPermission(permissions, "fleet.vehicles.create")).toBe(true);
    expect(hasPermission(permissions, "fleet.vehicles.update")).toBe(true);
    expect(hasPermission(permissions, "fleet.vehicles.delete")).toBe(false);
    expect(hasPermission(permissions, "fleet.vehicles.restore")).toBe(false);
    expect(hasPermission(permissions, "fleet.members.manage")).toBe(false);
  });

  it("gives Fleet Managers delete/restore and operations, not finance", () => {
    const permissions = permissionsForRole("fleet_manager");
    expect(hasPermission(permissions, "fleet.vehicles.delete")).toBe(true);
    expect(hasPermission(permissions, "fleet.vehicles.restore")).toBe(true);
    expect(hasPermission(permissions, "fleet.operations.manage")).toBe(true);
    expect(hasPermission(permissions, "finance.expenses.read")).toBe(false);
    expect(hasPermission(permissions, "fleet.members.manage")).toBe(false);
  });

  it("gives Finance Manager finance but not roles, security, or operations", () => {
    const permissions = permissionsForRole("finance_manager");
    expect(hasPermission(permissions, "finance.expenses.manage")).toBe(true);
    expect(hasPermission(permissions, "finance.income.manage")).toBe(true);
    expect(hasPermission(permissions, "finance.remittances.manage")).toBe(true);
    expect(hasPermission(permissions, "finance.context.read")).toBe(true);
    expect(hasPermission(permissions, "fleet.members.manage")).toBe(false);
    expect(hasPermission(permissions, "fleet.vehicles.update")).toBe(false);
    expect(hasPermission(permissions, "fleet.operations.manage")).toBe(false);
  });

  it("keeps Read Only limited to view access", () => {
    const permissions = permissionsForRole("read_only");
    expect(hasPermission(permissions, "fleet.vehicles.read")).toBe(true);
    expect(hasPermission(permissions, "fleet.vehicles.create")).toBe(false);
    expect(hasPermission(permissions, "finance.expenses.read")).toBe(false);
  });
});

describe("fleet policy", () => {
  it("uses documented defaults for missing values", () => {
    expect(normalizeFleetPolicy(null)).toEqual(DEFAULT_FLEET_POLICY);
    expect(normalizeFleetPolicy({})).toEqual(DEFAULT_FLEET_POLICY);
  });

  it("does not turn a malformed value into a permission", () => {
    const policy = normalizeFleetPolicy({
      member_can_write: "yes",
      member_can_export: 1,
      readonly_can_export: false,
      manager_can_manage_members: true,
    });
    expect(policy.memberCanWrite).toBe(DEFAULT_FLEET_POLICY.memberCanWrite);
    expect(policy.memberCanExport).toBe(DEFAULT_FLEET_POLICY.memberCanExport);
    expect(policy.readonlyCanExport).toBe(false);
    expect(policy.managerCanManageMembers).toBe(true);
  });
});
