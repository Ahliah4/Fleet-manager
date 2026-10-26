import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TokenVerifier } from "./jwtVerifier.js";
import {
  accountNotProvisioned,
  authInvalid,
  authNotConfigured,
  authRequired,
  fleetInactive,
  noActiveFleet,
  permissionDenied,
} from "../domain/errors.js";
import type { Session } from "../domain/session.js";
import type { Database } from "../db/database.js";

declare module "fastify" {
  interface FastifyRequest {
    session: Session | null;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireFleet: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePlatformAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export interface AuthDependencies {
  verifier: TokenVerifier | null;
  database: Database;
}

export function registerAuth(app: FastifyInstance, dependencies: AuthDependencies): void {
  app.decorateRequest("session", null);

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    if (!dependencies.verifier) {
      throw authNotConfigured();
    }

    const authorization = request.headers.authorization;
    if (!authorization) {
      reply.header("www-authenticate", "Bearer");
      throw authRequired();
    }

    const [scheme, token, ...rest] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
      reply.header("www-authenticate", "Bearer");
      throw authInvalid();
    }

    let identity;
    try {
      identity = await dependencies.verifier.verify(token);
    } catch {
      reply.header("www-authenticate", "Bearer");
      throw authInvalid();
    }

    const session = await dependencies.database.resolveSession(identity.subject);
    if (!session) {
      throw accountNotProvisioned();
    }

    request.session = session;
  });

  app.decorate("requireFleet", async (request: FastifyRequest) => {
    const session = request.session;
    if (!session) {
      throw authRequired();
    }
    if (!session.membership) {
      throw noActiveFleet();
    }
    if (session.membership.fleet.status !== "active") {
      throw fleetInactive();
    }
  });

  app.decorate("requirePlatformAdmin", async (request: FastifyRequest) => {
    const session = request.session;
    if (!session) {
      throw authRequired();
    }
    if (!session.platformAdmin) {
      throw permissionDenied(
        "This area is for platform administrators. Fleet roles cannot access it.",
      );
    }
  });
}
