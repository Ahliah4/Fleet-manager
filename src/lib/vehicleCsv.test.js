import { describe, expect, it } from "vitest";
import { isIsoDate, normalizeRegistration, parseCsv, parseVehicleCsv } from "./vehicleCsv";

describe("parseCsv", () => {
    it("reads quoted fields, escaped quotes, and newlines", () => {
        const rows = parseCsv('"Registration","Make","Notes"\r\n"BAA 1234","Toyota","Line one\nLine two, with comma"\r\n"BAA 5678","Honda","Say ""hello"""');
        expect(rows).toEqual([
            ["Registration", "Make", "Notes"],
            ["BAA 1234", "Toyota", "Line one\nLine two, with comma"],
            ["BAA 5678", "Honda", 'Say "hello"'],
        ]);
    });

    it("removes a UTF-8 BOM and skips blank lines", () => {
        const rows = parseCsv("\uFEFFRegistration,Make\n\nBAA 1234,Toyota\n");
        expect(rows).toEqual([
            ["Registration", "Make"],
            ["BAA 1234", "Toyota"],
        ]);
    });
});

describe("normalizeRegistration", () => {
    it("trims, uppercases, and collapses spaces", () => {
        expect(normalizeRegistration("  baa   1234 ")).toBe("BAA 1234");
    });
});

describe("isIsoDate", () => {
    it("accepts real dates and rejects impossible or malformed ones", () => {
        expect(isIsoDate("2027-02-08")).toBe(true);
        expect(isIsoDate("2027-02-30")).toBe(false);
        expect(isIsoDate("08/02/2027")).toBe(false);
        expect(isIsoDate("")).toBe(false);
    });
});

describe("parseVehicleCsv", () => {
    const header = "Registration,Make,Model,Year,Colour,Insurance Expiry,Road Tax Expiry,Roadworthy Expiry,Status";

    it("maps aliases, trims values, and skips existing registrations", () => {
        const csv = [
            header,
            " bld1229zm , Honda , Fit ,2010, Yellow ,2027-10-14,2027-10-14,2027-02-08,Active",
            "BBE7466ZM,Honda,Fit,2010,Purple,2026-12-01,2026-12-24,2027-03-25,Active",
        ].join("\n");
        const result = parseVehicleCsv(csv, [{ registration: "BLD1229ZM" }]);
        expect(result.duplicates).toHaveLength(1);
        expect(result.vehicles).toHaveLength(1);
        expect(result.vehicles[0]).toMatchObject({
            registration: "BBE7466ZM",
            make: "Honda",
            model: "Fit",
            year: 2010,
            colour: "Purple",
            insuranceExpiry: "2026-12-01",
        });
    });

    it("reports missing required values, bad years, and bad dates", () => {
        const csv = [
            header,
            ",Honda,Fit,2010,White,,,,Active",
            "AAA111,Honda,Fit,1800,White,,,,Active",
            "BBB222,Honda,Fit,2010,White,2027-13-01,,,Active",
            "CCC333,Honda,Fit,2010,White,2027-02-08,,,Active",
        ].join("\n");
        const result = parseVehicleCsv(csv);
        expect(result.vehicles.map((vehicle) => vehicle.registration)).toEqual(["CCC333"]);
        expect(result.invalid).toHaveLength(3);
        expect(result.invalid.map((item) => item.reason)).toEqual([
            "Registration, make, and model are required.",
            `Year must be between 1950 and ${new Date().getFullYear() + 1}.`,
            "insuranceExpiry must use YYYY-MM-DD.",
        ]);
    });

    it("deduplicates repeated registrations inside the same file", () => {
        const csv = [header, "AAA111,Honda,Fit,2010,White,,,,Active", "aaa111,Honda,Fit,2010,White,,,,Active"].join("\n");
        const result = parseVehicleCsv(csv);
        expect(result.vehicles).toHaveLength(1);
        expect(result.duplicates).toHaveLength(1);
    });

    it("returns a clear error when required columns are missing", () => {
        expect(parseVehicleCsv("Registration,Make\nAAA111,Honda")).toEqual({ error: "The CSV needs Registration, Make, and Model columns." });
        expect(parseVehicleCsv("")).toEqual({ error: "The file is empty. Choose the vehicle CSV and try again." });
    });
});
