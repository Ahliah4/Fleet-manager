import { describe, expect, it } from "vitest";
import {
  driverUpdateSchema,
  expenseBodySchema,
  financeQuerySchema,
  hireBodySchema,
  remittanceBodySchema,
  vehicleBodySchema,
  vehicleUpdateSchema,
} from "../src/routes/schemas.js";

describe("vehicle validation", () => {
  const valid = {
    registrationNumber: " aaa 111 ",
    make: "Toyota",
    model: "Corolla",
    year: 2020,
    colour: "White",
    notes: "",
    insuranceExpiry: "2027-01-01",
    roadTaxExpiry: null,
  };

  it("trims and normalizes registration and empty optional text", () => {
    const parsed = vehicleBodySchema.parse(valid);
    expect(parsed.registrationNumber).toBe("AAA 111");
    expect(parsed.notes).toBeNull();
    expect(parsed.colour).toBe("White");
  });

  it("rejects client-supplied fleet or role fields", () => {
    for (const extra of [{ fleetId: "11111111-1111-4111-8111-111111111111" }, { role: "fleet_owner" }]) {
      const result = vehicleBodySchema.safeParse({ ...valid, ...extra });
      expect(result.success).toBe(false);
    }
  });

  it("rejects impossible calendar dates", () => {
    const result = vehicleBodySchema.safeParse({
      ...valid,
      insuranceExpiry: "2027-02-30",
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one field for an update", () => {
    expect(vehicleUpdateSchema.safeParse({}).success).toBe(false);
    expect(vehicleUpdateSchema.safeParse({ colour: null }).success).toBe(true);
  });
});

describe("driver validation", () => {
  it("does not apply the create default to a partial update", () => {
    const parsed = driverUpdateSchema.parse({ fullName: "New Name" });
    expect(parsed).toEqual({ fullName: "New Name" });
  });
});

describe("hire validation", () => {
  const valid = {
    vehicleId: "a0000001-0000-4000-8000-000000000001",
    driverId: "a1000001-0000-4000-8000-000000000001",
    status: "planned",
    startsAt: "2026-10-26T08:00:00Z",
    expectedEndAt: "2026-10-26T18:00:00Z",
  };

  it("rejects an end before the start", () => {
    const result = hireBodySchema.safeParse({
      ...valid,
      expectedEndAt: "2026-10-26T07:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid ISO timestamp", () => {
    const parsed = hireBodySchema.parse(valid);
    expect(parsed.startsAt).toBeInstanceOf(Date);
  });
});

describe("finance validation", () => {
  it("normalizes money and defaults currency to ZMW", () => {
    const parsed = expenseBodySchema.parse({
      vehicleId: "a0000001-0000-4000-8000-000000000001",
      entryDate: "2026-10-26",
      category: "Repairs",
      description: "Brake pads",
      amount: 1250.5,
    });
    expect(parsed.amount).toBe("1250.50");
    expect(parsed.currency).toBe("ZMW");
  });

  it("rejects more than two decimal places", () => {
    const result = expenseBodySchema.safeParse({
      vehicleId: "a0000001-0000-4000-8000-000000000001",
      entryDate: "2026-10-26",
      category: "Repairs",
      description: "Brake pads",
      amount: "12.345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a remittance period that runs backwards", () => {
    const result = remittanceBodySchema.safeParse({
      entryDate: "2026-10-26",
      driverId: "a1000001-0000-4000-8000-000000000001",
      periodStart: "2026-10-26",
      periodEnd: "2026-10-25",
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a reversed finance date filter", () => {
    const result = financeQuerySchema.safeParse({
      from: "2026-10-26",
      to: "2026-10-25",
    });
    expect(result.success).toBe(false);
  });
});
