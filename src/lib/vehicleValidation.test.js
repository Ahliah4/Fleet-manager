import { describe, expect, it } from "vitest";

import { firstError, validateVehicle } from "./vehicleValidation";

const now = new Date(2026, 9, 21);

const valid = {
    registration_number: "ABC-1234",
    make: "Toyota",
    model: "Hilux",
    year: "2024",
    colour: "White",
    insurance_expiry: "2027-01-01",
    road_tax_expiry: "",
    roadworthy_expiry: "",
    next_service_date: "2026-11-01",
    notes: "",
};

describe("validateVehicle", () => {
    it("accepts a complete vehicle", () => {
        expect(validateVehicle(valid, { now })).toEqual({ errors: {}, isValid: true });
    });

    it("requires registration, make, model, and year", () => {
        const result = validateVehicle({}, { now });

        expect(result.isValid).toBe(false);
        expect(result.errors.registration_number).toBeTruthy();
        expect(result.errors.make).toBeTruthy();
        expect(result.errors.model).toBeTruthy();
        expect(result.errors.year).toBeTruthy();
    });

    it("rejects impossible years", () => {
        expect(validateVehicle({ ...valid, year: "1899" }, { now }).errors.year).toBeTruthy();
        expect(validateVehicle({ ...valid, year: "2028" }, { now }).errors.year).toBeTruthy();
        expect(validateVehicle({ ...valid, year: "2024.5" }, { now }).errors.year).toBeTruthy();
    });

    it("rejects invalid calendar dates", () => {
        const result = validateVehicle({ ...valid, insurance_expiry: "2026-02-31" }, { now });

        expect(result.errors.insurance_expiry).toBeTruthy();
    });

    it("limits notes length", () => {
        const result = validateVehicle({ ...valid, notes: "x".repeat(2001) }, { now });

        expect(result.errors.notes).toBeTruthy();
    });

    it("returns the first readable error", () => {
        expect(firstError({ make: "Make is required." })).toBe("Make is required.");
        expect(firstError({})).toBeNull();
    });
});
