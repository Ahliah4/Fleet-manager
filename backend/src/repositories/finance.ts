import type { PoolClient } from "pg";
import { alreadyVoided, notFound } from "../domain/errors.js";
import type { FleetSession } from "../domain/session.js";
import { escapeLike } from "../domain/validation.js";
import type { ListResult } from "./vehicles.js";

export type FinanceStatus = "posted" | "voided";

interface FinanceBase {
  id: string;
  entryDate: string;
  amount: string;
  currency: string;
  paymentMethod: string | null;
  notes: string | null;
  status: FinanceStatus;
  voidReason: string | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseRecord extends FinanceBase {
  vehicleId: string;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  category: string;
  description: string;
  supplier: string | null;
}

export interface IncomeRecord extends FinanceBase {
  description: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  driverId: string | null;
  driverName: string | null;
  reference: string | null;
}

export interface RemittanceRecord extends FinanceBase {
  driverId: string;
  driverName: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  vehicleName: string | null;
  periodStart: string;
  periodEnd: string;
  reference: string | null;
}

export interface ExpenseInput {
  vehicleId: string;
  entryDate: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  supplier?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
}

export interface IncomeInput {
  entryDate: string;
  description: string;
  amount: string;
  currency: string;
  vehicleId?: string | null;
  driverId?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface RemittanceInput {
  entryDate: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  currency: string;
  vehicleId?: string | null;
  paymentMethod?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface FinanceListQuery {
  limit: number;
  offset: number;
  from?: string;
  to?: string;
  vehicleId?: string;
  driverId?: string;
  status?: FinanceStatus;
  search?: string;
}

const EXPENSE_COLUMNS = `
  e.id,
  e.entry_date AS "entryDate",
  e.vehicle_id AS "vehicleId",
  v.registration_number AS "vehicleRegistration",
  trim(concat_ws(' ', v.make, v.model)) AS "vehicleName",
  e.category,
  e.description,
  e.amount::text AS amount,
  e.currency,
  e.supplier,
  e.payment_method AS "paymentMethod",
  e.notes,
  e.status,
  e.void_reason AS "voidReason",
  e.voided_at AS "voidedAt",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt"
`;

const INCOME_COLUMNS = `
  i.id,
  i.entry_date AS "entryDate",
  i.description,
  i.amount::text AS amount,
  i.currency,
  i.vehicle_id AS "vehicleId",
  v.registration_number AS "vehicleRegistration",
  trim(concat_ws(' ', v.make, v.model)) AS "vehicleName",
  i.driver_id AS "driverId",
  d.full_name AS "driverName",
  i.payment_method AS "paymentMethod",
  i.reference,
  i.notes,
  i.status,
  i.void_reason AS "voidReason",
  i.voided_at AS "voidedAt",
  i.created_at AS "createdAt",
  i.updated_at AS "updatedAt"
`;

const REMITTANCE_COLUMNS = `
  r.id,
  r.entry_date AS "entryDate",
  r.driver_id AS "driverId",
  d.full_name AS "driverName",
  r.vehicle_id AS "vehicleId",
  v.registration_number AS "vehicleRegistration",
  trim(concat_ws(' ', v.make, v.model)) AS "vehicleName",
  r.period_start AS "periodStart",
  r.period_end AS "periodEnd",
  r.amount::text AS amount,
  r.currency,
  r.payment_method AS "paymentMethod",
  r.reference,
  r.notes,
  r.status,
  r.void_reason AS "voidReason",
  r.voided_at AS "voidedAt",
  r.created_at AS "createdAt",
  r.updated_at AS "updatedAt"
`;

export async function createExpense(
  client: PoolClient,
  session: FleetSession,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO expenses (
       fleet_id, vehicle_id, entry_date, category, description, amount, currency,
       supplier, payment_method, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      session.membership.fleet.id,
      input.vehicleId,
      input.entryDate,
      input.category,
      input.description,
      input.amount,
      input.currency,
      input.supplier ?? null,
      input.paymentMethod ?? null,
      input.notes ?? null,
      session.user.id,
    ],
  );
  return requireExpense(client, session.membership.fleet.id, result.rows[0]!.id);
}

export async function listExpenses(
  client: PoolClient,
  fleetId: string,
  query: FinanceListQuery,
): Promise<ListResult<ExpenseRecord>> {
  const search = query.search ? `%${escapeLike(query.search.toLowerCase())}%` : null;
  const filter = `
    e.fleet_id = $1
    AND ($2::date IS NULL OR e.entry_date >= $2::date)
    AND ($3::date IS NULL OR e.entry_date <= $3::date)
    AND ($4::uuid IS NULL OR e.vehicle_id = $4)
    AND ($5::finance_status IS NULL OR e.status = $5::finance_status)
    AND (
      $6::text IS NULL
      OR lower(e.description) LIKE $6 ESCAPE '\\'
      OR lower(e.category) LIKE $6 ESCAPE '\\'
      OR lower(coalesce(e.supplier, '')) LIKE $6 ESCAPE '\\'
    )
  `;
  const values = [
    fleetId,
    query.from ?? null,
    query.to ?? null,
    query.vehicleId ?? null,
    query.status ?? null,
    search,
  ];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM expenses e
     WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<ExpenseRecord>(
    `SELECT ${EXPENSE_COLUMNS}
     FROM expenses e
     LEFT JOIN vehicles v ON v.id = e.vehicle_id AND v.fleet_id = e.fleet_id
     WHERE ${filter}
     ORDER BY e.entry_date DESC, e.created_at DESC, e.id DESC
     LIMIT $7 OFFSET $8`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getExpense(
  client: PoolClient,
  fleetId: string,
  expenseId: string,
): Promise<ExpenseRecord | null> {
  const result = await client.query<ExpenseRecord>(
    `SELECT ${EXPENSE_COLUMNS}
     FROM expenses e
     LEFT JOIN vehicles v ON v.id = e.vehicle_id AND v.fleet_id = e.fleet_id
     WHERE e.id = $1 AND e.fleet_id = $2`,
    [expenseId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireExpense(
  client: PoolClient,
  fleetId: string,
  expenseId: string,
): Promise<ExpenseRecord> {
  const expense = await getExpense(client, fleetId, expenseId);
  if (!expense) {
    throw notFound("We could not find that expense in your fleet.");
  }
  return expense;
}

export async function voidExpense(
  client: PoolClient,
  session: FleetSession,
  expenseId: string,
  reason: string,
): Promise<ExpenseRecord> {
  await voidFinanceRecord(
    client,
    "expenses",
    "expense",
    expenseId,
    session,
    reason,
  );
  return requireExpense(client, session.membership.fleet.id, expenseId);
}

export async function createIncome(
  client: PoolClient,
  session: FleetSession,
  input: IncomeInput,
): Promise<IncomeRecord> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO income_entries (
       fleet_id, entry_date, description, amount, currency, vehicle_id, driver_id,
       payment_method, reference, notes, created_by
     ) VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      session.membership.fleet.id,
      input.entryDate,
      input.description,
      input.amount,
      input.currency,
      input.vehicleId ?? null,
      input.driverId ?? null,
      input.paymentMethod ?? null,
      input.reference ?? null,
      input.notes ?? null,
      session.user.id,
    ],
  );
  return requireIncome(client, session.membership.fleet.id, result.rows[0]!.id);
}

export async function listIncome(
  client: PoolClient,
  fleetId: string,
  query: FinanceListQuery,
): Promise<ListResult<IncomeRecord>> {
  const search = query.search ? `%${escapeLike(query.search.toLowerCase())}%` : null;
  const filter = `
    i.fleet_id = $1
    AND ($2::date IS NULL OR i.entry_date >= $2::date)
    AND ($3::date IS NULL OR i.entry_date <= $3::date)
    AND ($4::uuid IS NULL OR i.vehicle_id = $4)
    AND ($5::uuid IS NULL OR i.driver_id = $5)
    AND ($6::finance_status IS NULL OR i.status = $6::finance_status)
    AND (
      $7::text IS NULL
      OR lower(i.description) LIKE $7 ESCAPE '\\'
      OR lower(coalesce(i.reference, '')) LIKE $7 ESCAPE '\\'
    )
  `;
  const values = [
    fleetId,
    query.from ?? null,
    query.to ?? null,
    query.vehicleId ?? null,
    query.driverId ?? null,
    query.status ?? null,
    search,
  ];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM income_entries i
     WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<IncomeRecord>(
    `SELECT ${INCOME_COLUMNS}
     FROM income_entries i
     LEFT JOIN vehicles v ON v.id = i.vehicle_id AND v.fleet_id = i.fleet_id
     LEFT JOIN drivers d ON d.id = i.driver_id AND d.fleet_id = i.fleet_id
     WHERE ${filter}
     ORDER BY i.entry_date DESC, i.created_at DESC, i.id DESC
     LIMIT $8 OFFSET $9`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getIncome(
  client: PoolClient,
  fleetId: string,
  incomeId: string,
): Promise<IncomeRecord | null> {
  const result = await client.query<IncomeRecord>(
    `SELECT ${INCOME_COLUMNS}
     FROM income_entries i
     LEFT JOIN vehicles v ON v.id = i.vehicle_id AND v.fleet_id = i.fleet_id
     LEFT JOIN drivers d ON d.id = i.driver_id AND d.fleet_id = i.fleet_id
     WHERE i.id = $1 AND i.fleet_id = $2`,
    [incomeId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireIncome(
  client: PoolClient,
  fleetId: string,
  incomeId: string,
): Promise<IncomeRecord> {
  const income = await getIncome(client, fleetId, incomeId);
  if (!income) {
    throw notFound("We could not find that income record in your fleet.");
  }
  return income;
}

export async function voidIncome(
  client: PoolClient,
  session: FleetSession,
  incomeId: string,
  reason: string,
): Promise<IncomeRecord> {
  await voidFinanceRecord(
    client,
    "income_entries",
    "income record",
    incomeId,
    session,
    reason,
  );
  return requireIncome(client, session.membership.fleet.id, incomeId);
}

export async function createRemittance(
  client: PoolClient,
  session: FleetSession,
  input: RemittanceInput,
): Promise<RemittanceRecord> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO remittances (
       fleet_id, entry_date, driver_id, period_start, period_end, amount, currency,
       vehicle_id, payment_method, reference, notes, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      session.membership.fleet.id,
      input.entryDate,
      input.driverId,
      input.periodStart,
      input.periodEnd,
      input.amount,
      input.currency,
      input.vehicleId ?? null,
      input.paymentMethod ?? null,
      input.reference ?? null,
      input.notes ?? null,
      session.user.id,
    ],
  );
  return requireRemittance(
    client,
    session.membership.fleet.id,
    result.rows[0]!.id,
  );
}

export async function listRemittances(
  client: PoolClient,
  fleetId: string,
  query: FinanceListQuery,
): Promise<ListResult<RemittanceRecord>> {
  const search = query.search ? `%${escapeLike(query.search.toLowerCase())}%` : null;
  const filter = `
    r.fleet_id = $1
    AND ($2::date IS NULL OR r.entry_date >= $2::date)
    AND ($3::date IS NULL OR r.entry_date <= $3::date)
    AND ($4::uuid IS NULL OR r.vehicle_id = $4)
    AND ($5::uuid IS NULL OR r.driver_id = $5)
    AND ($6::finance_status IS NULL OR r.status = $6::finance_status)
    AND (
      $7::text IS NULL
      OR lower(coalesce(r.reference, '')) LIKE $7 ESCAPE '\\'
      OR lower(coalesce(r.notes, '')) LIKE $7 ESCAPE '\\'
      OR lower(coalesce(d.full_name, '')) LIKE $7 ESCAPE '\\'
    )
  `;
  const values = [
    fleetId,
    query.from ?? null,
    query.to ?? null,
    query.vehicleId ?? null,
    query.driverId ?? null,
    query.status ?? null,
    search,
  ];

  const countResult = await client.query<{ total: string }>(
    `SELECT count(*)::text AS total
     FROM remittances r
     LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id
     WHERE ${filter}`,
    values,
  );
  const rowsResult = await client.query<RemittanceRecord>(
    `SELECT ${REMITTANCE_COLUMNS}
     FROM remittances r
     LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id
     LEFT JOIN vehicles v ON v.id = r.vehicle_id AND v.fleet_id = r.fleet_id
     WHERE ${filter}
     ORDER BY r.entry_date DESC, r.created_at DESC, r.id DESC
     LIMIT $8 OFFSET $9`,
    [...values, query.limit, query.offset],
  );

  return {
    items: rowsResult.rows,
    total: Number(countResult.rows[0]?.total ?? 0),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getRemittance(
  client: PoolClient,
  fleetId: string,
  remittanceId: string,
): Promise<RemittanceRecord | null> {
  const result = await client.query<RemittanceRecord>(
    `SELECT ${REMITTANCE_COLUMNS}
     FROM remittances r
     LEFT JOIN drivers d ON d.id = r.driver_id AND d.fleet_id = r.fleet_id
     LEFT JOIN vehicles v ON v.id = r.vehicle_id AND v.fleet_id = r.fleet_id
     WHERE r.id = $1 AND r.fleet_id = $2`,
    [remittanceId, fleetId],
  );
  return result.rows[0] ?? null;
}

export async function requireRemittance(
  client: PoolClient,
  fleetId: string,
  remittanceId: string,
): Promise<RemittanceRecord> {
  const remittance = await getRemittance(client, fleetId, remittanceId);
  if (!remittance) {
    throw notFound("We could not find that remittance in your fleet.");
  }
  return remittance;
}

export async function voidRemittance(
  client: PoolClient,
  session: FleetSession,
  remittanceId: string,
  reason: string,
): Promise<RemittanceRecord> {
  await voidFinanceRecord(
    client,
    "remittances",
    "remittance",
    remittanceId,
    session,
    reason,
  );
  return requireRemittance(client, session.membership.fleet.id, remittanceId);
}

async function voidFinanceRecord(
  client: PoolClient,
  table: "expenses" | "income_entries" | "remittances",
  recordName: string,
  recordId: string,
  session: FleetSession,
  reason: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `UPDATE ${table}
     SET status = 'voided',
         void_reason = $3,
         voided_at = now(),
         voided_by = $4,
         updated_at = now()
     WHERE id = $1 AND fleet_id = $2 AND status = 'posted'
     RETURNING id`,
    [recordId, session.membership.fleet.id, reason, session.user.id],
  );

  if (result.rows[0]) {
    return;
  }

  const existing = await client.query<{ status: string }>(
    `SELECT status FROM ${table} WHERE id = $1 AND fleet_id = $2`,
    [recordId, session.membership.fleet.id],
  );
  if (!existing.rows[0]) {
    throw notFound(`We could not find that ${recordName} in your fleet.`);
  }
  throw alreadyVoided(recordName);
}
