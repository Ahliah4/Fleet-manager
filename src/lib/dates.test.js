import { describe, expect, it } from "vitest";

import { daysUntil, formatDate, parseLocalDate, todayInputValue } from "./dates";

describe("parseLocalDate", () => {
    it("parses date-only values at local midnight", () => {
        const date = parseLocalDate("2026-10-21");

        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(9);
        expect(date.getDate()).toBe(21);
        expect(date.getHours()).toBe(0);
    });

    it("rejects impossible calendar dates instead of rolling over", () => {
        expect(parseLocalDate("2026-02-31")).toBeNull();
        expect(parseLocalDate("2026-13-01")).toBeNull();
        expect(parseLocalDate("not-a-date")).toBeNull();
    });

    it("returns null for empty values", () => {
        expect(parseLocalDate("")).toBeNull();
        expect(parseLocalDate(null)).toBeNull();
    });
});

describe("daysUntil", () => {
    const now = new Date(2026, 9, 21, 15, 30);

    it("counts today as zero", () => {
        expect(daysUntil("2026-10-21", now)).toBe(0);
    });

    it("counts future and past days", () => {
        expect(daysUntil("2026-10-28", now)).toBe(7);
        expect(daysUntil("2026-10-20", now)).toBe(-1);
    });

    it("returns null for invalid dates", () => {
        expect(daysUntil("", now)).toBeNull();
        expect(daysUntil("2026-02-31", now)).toBeNull();
    });
});

describe("formatDate", () => {
    it("formats date-only values without a timezone shift", () => {
        expect(formatDate("2026-10-21")).toBe("Oct 21, 2026");
    });

    it("uses the fallback for empty values", () => {
        expect(formatDate(null)).toBe("Not set");
        expect(formatDate(null, "—")).toBe("—");
    });
});

describe("todayInputValue", () => {
    it("returns a local YYYY-MM-DD value", () => {
        expect(todayInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    });
});
