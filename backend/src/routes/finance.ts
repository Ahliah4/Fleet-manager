import type { FastifyInstance } from "fastify";
import type { Database } from "../db/database.js";
import { recordAuditEvent } from "../repositories/audit.js";
import {
  createExpense,
  createIncome,
  createRemittance,
  listExpenses,
  listIncome,
  listRemittances,
  requireExpense,
  requireIncome,
  requireRemittance,
  voidExpense,
  voidIncome,
  voidRemittance,
} from "../repositories/finance.js";
import {
  fleetSession,
  pagination,
  parseInput,
  requirePermission,
  requestAuditFields,
} from "./http.js";
import {
  expenseBodySchema,
  financeIdParamsSchema,
  financeQuerySchema,
  incomeBodySchema,
  remittanceBodySchema,
  voidBodySchema,
} from "./schemas.js";

export function registerFinanceRoutes(
  app: FastifyInstance,
  dependencies: { database: Database },
): void {
  const preHandler = [app.authenticate, app.requireFleet];

  app.get("/v1/expenses", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.expenses.read");
    const query = parseInput(financeQuerySchema, request.query);
    const result = await dependencies.database.withFleet(session, (client) =>
      listExpenses(client, session.membership.fleet.id, query),
    );
    return {
      expenses: result.items,
      pagination: pagination(result.total, result.limit, result.offset),
    };
  });

  app.post("/v1/expenses", { preHandler }, async (request, reply) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.expenses.manage");
    const body = parseInput(expenseBodySchema, request.body);
    const audit = requestAuditFields(request);

    const expense = await dependencies.database.withFleet(session, async (client) => {
      const created = await createExpense(client, session, body);
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "expense.created",
        targetType: "expense",
        targetId: created.id,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: {
          entryDate: created.entryDate,
          amount: created.amount,
          currency: created.currency,
        },
      });
      return created;
    });

    reply.code(201);
    return { expense };
  });

  app.get("/v1/expenses/:recordId", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.expenses.read");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const expense = await dependencies.database.withFleet(session, (client) =>
      requireExpense(client, session.membership.fleet.id, recordId),
    );
    return { expense };
  });

  app.post("/v1/expenses/:recordId/void", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.expenses.manage");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const body = parseInput(voidBodySchema, request.body);
    const audit = requestAuditFields(request);

    const expense = await dependencies.database.withFleet(session, async (client) => {
      const voided = await voidExpense(client, session, recordId, body.reason);
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "expense.voided",
        targetType: "expense",
        targetId: voided.id,
        reason: body.reason,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: {
          entryDate: voided.entryDate,
          amount: voided.amount,
          currency: voided.currency,
        },
      });
      return voided;
    });

    return { expense };
  });

  app.get("/v1/income", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.income.read");
    const query = parseInput(financeQuerySchema, request.query);
    const result = await dependencies.database.withFleet(session, (client) =>
      listIncome(client, session.membership.fleet.id, query),
    );
    return {
      income: result.items,
      pagination: pagination(result.total, result.limit, result.offset),
    };
  });

  app.post("/v1/income", { preHandler }, async (request, reply) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.income.manage");
    const body = parseInput(incomeBodySchema, request.body);
    const audit = requestAuditFields(request);

    const income = await dependencies.database.withFleet(session, async (client) => {
      const created = await createIncome(client, session, body);
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "income.created",
        targetType: "income",
        targetId: created.id,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: {
          entryDate: created.entryDate,
          amount: created.amount,
          currency: created.currency,
        },
      });
      return created;
    });

    reply.code(201);
    return { income };
  });

  app.get("/v1/income/:recordId", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.income.read");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const income = await dependencies.database.withFleet(session, (client) =>
      requireIncome(client, session.membership.fleet.id, recordId),
    );
    return { income };
  });

  app.post("/v1/income/:recordId/void", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.income.manage");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const body = parseInput(voidBodySchema, request.body);
    const audit = requestAuditFields(request);

    const income = await dependencies.database.withFleet(session, async (client) => {
      const voided = await voidIncome(client, session, recordId, body.reason);
      await recordAuditEvent(client, {
        actorUserId: session.user.id,
        actorType: "user",
        fleetId: session.membership.fleet.id,
        action: "income.voided",
        targetType: "income",
        targetId: voided.id,
        reason: body.reason,
        correlationId: audit.correlationId,
        ip: audit.ip,
        userAgent: audit.userAgent,
        metadata: {
          entryDate: voided.entryDate,
          amount: voided.amount,
          currency: voided.currency,
        },
      });
      return voided;
    });

    return { income };
  });

  app.get("/v1/remittances", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.remittances.read");
    const query = parseInput(financeQuerySchema, request.query);
    const result = await dependencies.database.withFleet(session, (client) =>
      listRemittances(client, session.membership.fleet.id, query),
    );
    return {
      remittances: result.items,
      pagination: pagination(result.total, result.limit, result.offset),
    };
  });

  app.post("/v1/remittances", { preHandler }, async (request, reply) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.remittances.manage");
    const body = parseInput(remittanceBodySchema, request.body);
    const audit = requestAuditFields(request);

    const remittance = await dependencies.database.withFleet(
      session,
      async (client) => {
        const created = await createRemittance(client, session, body);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "remittance.created",
          targetType: "remittance",
          targetId: created.id,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: {
            entryDate: created.entryDate,
            periodStart: created.periodStart,
            periodEnd: created.periodEnd,
            amount: created.amount,
            currency: created.currency,
          },
        });
        return created;
      },
    );

    reply.code(201);
    return { remittance };
  });

  app.get("/v1/remittances/:recordId", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.remittances.read");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const remittance = await dependencies.database.withFleet(session, (client) =>
      requireRemittance(client, session.membership.fleet.id, recordId),
    );
    return { remittance };
  });

  app.post("/v1/remittances/:recordId/void", { preHandler }, async (request) => {
    const session = fleetSession(request);
    requirePermission(session, "finance.remittances.manage");
    const { recordId } = parseInput(financeIdParamsSchema, request.params);
    const body = parseInput(voidBodySchema, request.body);
    const audit = requestAuditFields(request);

    const remittance = await dependencies.database.withFleet(
      session,
      async (client) => {
        const voided = await voidRemittance(client, session, recordId, body.reason);
        await recordAuditEvent(client, {
          actorUserId: session.user.id,
          actorType: "user",
          fleetId: session.membership.fleet.id,
          action: "remittance.voided",
          targetType: "remittance",
          targetId: voided.id,
          reason: body.reason,
          correlationId: audit.correlationId,
          ip: audit.ip,
          userAgent: audit.userAgent,
          metadata: {
            entryDate: voided.entryDate,
            amount: voided.amount,
            currency: voided.currency,
          },
        });
        return voided;
      },
    );

    return { remittance };
  });
}
