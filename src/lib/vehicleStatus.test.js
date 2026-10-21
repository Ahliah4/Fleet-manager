import { describe, expect, it } from "vitest";

import { getStatus } from "./vehicleStatus";

const now = new Date(2026, 9, 21, 12, 0);

describe("getStatus", () => {
    it("does not mark a document expiring today as expired", () => {
        const status = getStatus({ insurance_expiry: "2026-10-21" }, { now });

        expect(status.label).not.toContain("Expired");
        expect(status.label).toBe("Insurance Due");
    });

    it("marks yesterday as expired", () => {
        expect(getStatus({ insurance_expiry: "2026-10-20" }, { now }).label).toBe(
            "Insurance Due (Expired)"
        );
    });

    it("marks a document inside the 30-day window as due", () => {
        expect(getStatus({ insurance_expiry: "2026-11-20" }, { now }).label).toBe(
            "Insurance Due"
        );
    });

    it("uses the earliest problem across documents", () => {
        const status = getStatus(
            {
                insurance_expiry: "2027-05-01",
                road_tax_expiry: "2026-10-01",
                roadworthy_expiry: "2026-11-01",
            },
            { now }
        );

        expect(status.label).toBe("Road Tax Due (Expired)");
    });

    it("includes service dates in compliance status", () => {
        expect(getStatus({ next_service_date: "2026-10-10" }, { now }).label).toBe(
            "Service Due (Expired)"
        );
    });

    it("is active when no dates are tracked", () => {
        expect(getStatus({}, { now })).toEqual({ label: "Active", color: "bg-green-600" });
    });
});
