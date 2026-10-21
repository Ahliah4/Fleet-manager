import { describe, expect, it } from "vitest";

import { escapeCsvCell, toCsv, vehiclesToCsv } from "./csv";

describe("escapeCsvCell", () => {
    it("quotes and escapes values", () => {
        expect(escapeCsvCell('AB"12')).toBe('"AB""12"');
        expect(escapeCsvCell("ABC-123")).toBe('"ABC-123"');
    });

    it.each(["=1+1", "+SUM(A1)", "-2+3", "@cmd", "  =1+1", "\t=1+1"])(
        "neutralises formula-like value %j",
        (value) => {
            expect(escapeCsvCell(value)).toBe(`"'${value}"`);
        }
    );

    it("leaves ordinary values alone", () => {
        expect(escapeCsvCell("Toyota")).toBe('"Toyota"');
        expect(escapeCsvCell("")).toBe('""');
    });
});

describe("toCsv", () => {
    it("joins headers and rows with CRLF", () => {
        expect(toCsv(["A", "B"], [[1, 2]])).toBe('"A","B"\r\n"1","2"');
    });
});

describe("vehiclesToCsv", () => {
    it("includes service dates and neutralises every cell", () => {
        const csv = vehiclesToCsv([
            {
                registration_number: "=HYPERLINK()",
                make: "Toyota",
                model: "Hilux",
                year: 2024,
                next_service_date: "2026-11-01",
                status: { label: "Active" },
                notes: "@SUM(1)",
            },
        ]);

        expect(csv.startsWith("\uFEFF")).toBe(true);
        expect(csv).toContain('"\'=HYPERLINK()"');
        expect(csv).toContain('"2026-11-01"');
        expect(csv).toContain('"\'@SUM(1)"');
        expect(csv).toContain('"Next Service"');
    });
});
