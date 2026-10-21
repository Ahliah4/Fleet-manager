// Spreadsheet apps evaluate cells beginning with = + - @ (optionally after
// whitespace or a control character) as formulas. Prefixing those cells with
// an apostrophe keeps the value visible while forcing it to stay text.
const FORMULA_PREFIX = /^[ \t\r\n\u00a0\uFEFF]*[=+\-@]/;
const BOM = "\uFEFF";

export function escapeCsvCell(value) {
    let text = String(value ?? "");

    if (FORMULA_PREFIX.test(text)) {
        text = `'${text}`;
    }

    return `"${text.replaceAll('"', '""')}"`;
}

export function toCsv(headers, rows) {
    return [headers, ...rows]
        .map((row) => row.map(escapeCsvCell).join(","))
        .join("\r\n");
}

export const VEHICLE_CSV_HEADERS = [
    "Registration",
    "Make",
    "Model",
    "Year",
    "Colour",
    "Insurance Expiry",
    "Road Tax Expiry",
    "Roadworthy Expiry",
    "Next Service",
    "Status",
    "Notes",
];

export function vehiclesToCsv(vehicles) {
    const rows = vehicles.map((vehicle) => [
        vehicle.registration_number,
        vehicle.make,
        vehicle.model,
        vehicle.year,
        vehicle.colour || "",
        vehicle.insurance_expiry || "",
        vehicle.road_tax_expiry || "",
        vehicle.roadworthy_expiry || "",
        vehicle.next_service_date || "",
        vehicle.status?.label || "",
        vehicle.notes || "",
    ]);

    // The BOM helps Excel recognise UTF-8 registrations and names.
    return BOM + toCsv(VEHICLE_CSV_HEADERS, rows);
}
