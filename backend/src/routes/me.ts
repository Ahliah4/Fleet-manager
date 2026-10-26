import type { FastifyInstance } from "fastify";

export function registerMeRoutes(app: FastifyInstance): void {
  app.get(
    "/v1/me",
    { preHandler: [app.authenticate] },
    async (request) => {
      const session = request.session;
      if (!session) {
        throw new Error("Authenticated session missing after authentication.");
      }

      const membership = session.membership;
      return {
        user: {
          id: session.user.id,
          displayName: session.user.displayName,
        },
        platformAdmin: session.platformAdmin,
        membership: membership
          ? {
              id: membership.id,
              role: membership.role,
              permissions: [...membership.permissions],
              fleet: {
                id: membership.fleet.id,
                name: membership.fleet.name,
                status: membership.fleet.status,
                policy: {
                  memberCanWrite: membership.fleet.policy.memberCanWrite,
                  memberCanExport: membership.fleet.policy.memberCanExport,
                  readonlyCanExport: membership.fleet.policy.readonlyCanExport,
                  managerCanManageMembers:
                    membership.fleet.policy.managerCanManageMembers,
                  managerCanAssignManager:
                    membership.fleet.policy.managerCanAssignManager,
                },
              },
            }
          : null,
        recovery:
          membership || session.platformAdmin
            ? null
            : {
                message:
                  "You are signed in, but you are not a member of a fleet.",
                nextStep:
                  "Ask your fleet owner or administrator to invite you, then sign in again.",
              },
      };
    },
  );
}
