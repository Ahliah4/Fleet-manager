async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The shared fleet service could not complete that request.");
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

async function loadAll(path, key) {
  const records = [];
  let offset = 0;
  for (;;) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await request(`${path}${separator}limit=100&offset=${offset}`);
    const page = Array.isArray(payload[key]) ? payload[key] : [];
    records.push(...page);
    if (page.length < 100 || records.length >= Number(payload.pagination?.total ?? records.length)) return records;
    offset += page.length;
  }
}

function vehicleFromApi(item, activeHire) {
  return {
    ...item,
    registration: item.registrationNumber,
    nextService: item.nextServiceDate,
    status: activeHire ? "On hire" : "Available",
    assignedDriverId: activeHire?.driverId || "",
    assignedDriver: activeHire?.driverName || "",
  };
}

function driverFromApi(item) {
  return { ...item, name: item.fullName, active: item.status === "active" };
}

function expenseFromApi(item) {
  return { ...item, date: item.entryDate, item: item.description, quantity: 1 };
}

function incomeFromApi(item) {
  return { ...item, date: item.entryDate, note: item.notes || item.description };
}

function remittanceFromApi(item) {
  return { ...item, date: item.entryDate, note: item.notes || "" };
}

export async function loadSharedFleet() {
  const me = await request("/v1/me");
  if (!me.membership) {
    const error = new Error(me.recovery?.message || "This account does not have fleet access yet.");
    error.status = 403;
    throw error;
  }
  const permissions = new Set(me.membership.permissions ?? []);
  const canReadVehicles = permissions.has("fleet.vehicles.read") || permissions.has("finance.context.read");
  const canReadDrivers = permissions.has("fleet.operations.read") || permissions.has("finance.context.read");
  const canReadOperations = permissions.has("fleet.operations.read");
  const [vehicles, drivers, hires, expenses, income, remittances] = await Promise.all([
    canReadVehicles ? loadAll("/v1/vehicles", "vehicles") : [],
    canReadDrivers ? loadAll("/v1/drivers", "drivers") : [],
    canReadOperations ? loadAll("/v1/hires?status=active", "hires") : [],
    permissions.has("finance.expenses.read") ? loadAll("/v1/expenses", "expenses") : [],
    permissions.has("finance.income.read") ? loadAll("/v1/income", "income") : [],
    permissions.has("finance.remittances.read") ? loadAll("/v1/remittances", "remittances") : [],
  ]);
  const activeHireByVehicle = new Map(hires.map((hire) => [hire.vehicleId, hire]));
  return {
    me,
    data: {
      vehicles: vehicles.map((vehicle) => vehicleFromApi(vehicle, activeHireByVehicle.get(vehicle.id))),
      drivers: drivers.map(driverFromApi),
      expenses: expenses.map(expenseFromApi),
      income: income.map(incomeFromApi),
      remittances: remittances.map(remittanceFromApi),
    },
  };
}

function vehicleBody(record) {
  return {
    registrationNumber: record.registration,
    make: record.make,
    model: record.model,
    year: Number(record.year) || new Date().getFullYear(),
    colour: record.colour || null,
    notes: record.notes || null,
    insuranceExpiry: record.insuranceExpiry || null,
    roadTaxExpiry: record.roadTaxExpiry || null,
    roadworthyExpiry: record.roadworthyExpiry || null,
    nextServiceDate: record.nextService || null,
  };
}

async function syncVehicleAssignment(vehicleId, driverId) {
  const current = await loadAll(`/v1/hires?vehicleId=${encodeURIComponent(vehicleId)}&status=active`, "hires");
  if (current.length === 1 && current[0].driverId === driverId) return;
  const now = new Date().toISOString();
  await Promise.all(current.map((hire) => request(`/v1/hires/${hire.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", actualEndAt: now }),
  })));
  if (driverId) {
    await request("/v1/hires", {
      method: "POST",
      body: JSON.stringify({ vehicleId, driverId, status: "active", startsAt: now }),
    });
  }
}

export async function saveSharedRecord(store, record) {
  if (store === "vehicles") {
    const payload = await request(record.id ? `/v1/vehicles/${record.id}` : "/v1/vehicles", {
      method: record.id ? "PATCH" : "POST",
      body: JSON.stringify(vehicleBody(record)),
    });
    const vehicleId = record.id || payload.vehicle?.id;
    if (vehicleId) await syncVehicleAssignment(vehicleId, record.assignedDriverId || "");
    return payload;
  }
  if (store === "drivers") {
    const body = {
      fullName: record.name,
      phone: record.phone || null,
      licenceNumber: record.licenceNumber || null,
      licenceExpiry: record.licenceExpiry || null,
      status: record.active ? "active" : "inactive",
      notes: record.notes || null,
    };
    return request(record.id ? `/v1/drivers/${record.id}` : "/v1/drivers", {
      method: record.id ? "PATCH" : "POST",
      body: JSON.stringify(body),
    });
  }
  if (store === "expenses") {
    return request("/v1/expenses", { method: "POST", body: JSON.stringify({
      vehicleId: record.vehicleId,
      entryDate: record.date,
      category: record.category,
      description: record.item,
      amount: String(record.amount),
      currency: "ZMW",
      supplier: record.supplier || null,
      paymentMethod: record.paymentMethod || null,
      notes: record.note || null,
    }) });
  }
  if (store === "income") {
    return request("/v1/income", { method: "POST", body: JSON.stringify({
      entryDate: record.date,
      description: record.note || "Fleet income",
      amount: String(record.amount),
      currency: "ZMW",
      vehicleId: record.vehicleId || null,
      driverId: record.driverId || null,
      paymentMethod: record.paymentMethod || null,
      notes: record.note || null,
    }) });
  }
  if (store === "remittances") {
    return request("/v1/remittances", { method: "POST", body: JSON.stringify({
      entryDate: record.date,
      driverId: record.driverId,
      periodStart: record.date,
      periodEnd: record.date,
      amount: String(record.amount),
      currency: "ZMW",
      vehicleId: record.vehicleId || null,
      paymentMethod: record.paymentMethod || null,
      notes: record.note || null,
    }) });
  }
  throw new Error("That shared record type is not supported.");
}

export async function importSharedVehicles(records, onProgress) {
  const result = { imported: 0, failed: 0, errors: [] };
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    try {
      await request("/v1/vehicles", { method: "POST", body: JSON.stringify(vehicleBody(record)) });
      result.imported += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({ registration: record.registration, message: error?.message || "Could not import this vehicle." });
    }
    onProgress?.(index + 1, records.length);
  }
  return result;
}

export async function deleteSharedRecord(store, id) {
  if (store !== "vehicles") throw new Error("Drivers with fleet history are made inactive instead of deleted.");
  return request(`/v1/vehicles/${id}`, { method: "DELETE" });
}

export async function signOutSharedFleet() {
  await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
}
