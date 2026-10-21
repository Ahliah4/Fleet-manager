import { describe, expect, it } from "vitest";

import { getDocumentRows, getMonthlyRegistrations } from "./vehicleHelpers";

describe("getMonthlyRegistrations", () => {
    const now = new Date(2026, 9, 21);

    it("returns a rolling 12-month window", () => {
        const months = getMonthlyRegistrations([], now);

        expect(months).toHaveLength(12);
        expect(months[0].month).toBe("Nov '25");
        expect(months[11].month).toBe("Oct '26");
    });

    it("does not combine the same month across years", () => {
        const months = getMonthlyRegistrations(
            [
                { created_at: "2025-01-15T10:00:00Z" },
                { created_at: "2026-01-20T10:00:00Z" },
            ],
            new Date(2026, 0, 15)
        );

        // The window is Feb 2025 – Jan 2026. A January 2025 record must not be
        // folded into January 2026 just because the month name matches.
        const jan25 = months.find((month) => month.month === "Jan '25");
        const jan26 = months.find((month) => month.month === "Jan '26");

        expect(jan25).toBeUndefined();
        expect(jan26.vehicles).toBe(1);
    });

    it("ignores records outside the window", () => {
        const months = getMonthlyRegistrations(
            [{ created_at: "2020-01-15T10:00:00Z" }],
            now
        );

        expect(months.reduce((total, month) => total + month.vehicles, 0)).toBe(0);
    });
});

describe("getDocumentRows", () => {
    it("returns one row per tracked document, including service", () => {
        const rows = getDocumentRows({
            insurance_expiry: "2020-01-01",
            road_tax_expiry: "2099-01-01",
        });

        expect(rows.map((row) => row.name)).toEqual([
            "Insurance",
            "Road Tax",
            "Roadworthy",
            "Service",
        ]);
        expect(rows[0].state).toBe("expired");
        expect(rows[1].state).toBe("active");
        expect(rows[2].state).toBe("missing");
    });
});
