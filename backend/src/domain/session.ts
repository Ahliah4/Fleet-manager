import type { FleetPolicy, FleetRole, Permission } from "./permissions.js";

export interface SessionUser {
  id: string;
  displayName: string;
}

export interface SessionFleet {
  id: string;
  name: string;
  status: "pending" | "active" | "suspended" | "closed";
  policy: FleetPolicy;
}

export interface SessionMembership {
  id: string;
  role: FleetRole;
  fleet: SessionFleet;
  permissions: readonly Permission[];
}

export interface Session {
  user: SessionUser;
  membership: SessionMembership | null;
  platformAdmin: boolean;
}

export type FleetSession = Session & { membership: SessionMembership };
