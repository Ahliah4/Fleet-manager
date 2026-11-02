const API_URL = "https://ip-motors-fleet-api-development.ip-motors-fleet.workers.dev";

async function request(token, path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "The shared fleet service could not complete that request.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function vehicleFromApi(item) {
  return {
    ...item,
    registration: item.registrationNumber,
    nextService: item.nextServiceDate,
    status: "Available",
  };
}

function driverFromApi(item) {
  return { ...item, name: item.fullName, active: item.status === "active" };
}

function expenseFromApi(item) {
  return { ...item, date: item.entryDate, item: item.description, quantity: 1 };
}

function incomeFromApi(item) {
  return { ...item, date: item.entryDate, note: item.description };
}

function remittanceFromApi(item) {
  return { ...item, date: item.entryDate, note: item.notes || "" };
}

export async function loadSharedFleet(token) {
  const [me, vehicles, drivers, expenses, income, remittances] = await Promise.all([
    request(token, "/v1/me"),
    request(token, "/v1/vehicles?limit=100"),
    request(token, "/v1/drivers?limit=100"),
    request(token, "/v1/expenses?limit=100"),
    request(token, "/v1/income?limit=100"),
    request(token, "/v1/remittances?limit=100"),
  ]);
  return {
    me,
    data: {
      vehicles: vehicles.vehicles.map(vehicleFromApi),
      drivers: drivers.drivers.map(driverFromApi),
      expenses: expenses.expenses.map(expenseFromApi),
      income: income.income.map(incomeFromApi),
      remittances: remittances.remittances.map(remittanceFromApi),
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

export async function saveSharedRecord(token, store, record) {
  if (store === "vehicles") {
    const path = record.id ? `/v1/vehicles/${record.id}` : "/v1/vehicles";
    return request(token, path, { method: record.id ? "PATCH" : "POST", body: JSON.stringify(vehicleBody(record)) });
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
    const path = record.id ? `/v1/drivers/${record.id}` : "/v1/drivers";
    return request(token, path, { method: record.id ? "PATCH" : "POST", body: JSON.stringify(body) });
  }
  if (store === "expenses") {
    return request(token, "/v1/expenses", { method: "POST", body: JSON.stringify({
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
    return request(token, "/v1/income", { method: "POST", body: JSON.stringify({
      entryDate: record.date,
      description: record.note || "Fleet income",
      amount: String(record.amount),
      currency: "ZMW",
      vehicleId: record.vehicleId || null,
      driverId: record.driverId || null,
      paymentMethod: record.paymentMethod || null,
    }) });
  }
  if (store === "remittances") {
    return request(token, "/v1/remittances", { method: "POST", body: JSON.stringify({
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
  throw new Error("That shared record type is not supported yet.");
}

export async function deleteSharedRecord(token, store, id) {
  if (store !== "vehicles") throw new Error("Drivers with history cannot be deleted from the shared fleet.");
  return request(token, `/v1/vehicles/${id}`, { method: "DELETE" });
}

