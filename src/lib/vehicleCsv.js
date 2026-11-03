const BOM = "\uFEFF";
const MAX_ROWS = 1000;
const FIRST_VEHICLE_YEAR = 1950;

const COLUMN_ALIASES = {
    registration: ["registration", "registrationnumber", "reg", "regnumber"],
    make: ["make"],
    model: ["model"],
    year: ["year"],
    colour: ["colour", "color"],
    insuranceExpiry: ["insuranceexpiry", "insurance"],
    roadTaxExpiry: ["roadtaxexpiry", "roadtax"],
    roadworthyExpiry: ["roadworthyexpiry", "roadworthy"],
    nextService: ["nextservice", "nextservicedate"],
    notes: ["notes", "note"],
};

function normalizeHeader(value) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const input = String(text ?? "").replace(BOM, "");

    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (inQuotes) {
            if (character === '"') {
                if (input[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += character;
            }
        } else if (character === '"') {
            inQuotes = true;
        } else if (character === ",") {
            row.push(field);
            field = "";
        } else if (character === "\n") {
            row.push(field);
            field = "";
            if (row.some((value) => value.trim() !== "")) rows.push(row);
            row = [];
        } else if (character !== "\r") {
            field += character;
        }
    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        if (row.some((value) => value.trim() !== "")) rows.push(row);
    }

    return rows;
}

function columnIndexes(header) {
    const normalized = header.map(normalizeHeader);
    const indexes = {};
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        indexes[key] = normalized.findIndex((value) => aliases.includes(value));
    }
    return indexes;
}

export function normalizeRegistration(value) {
    return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

export function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseVehicleCsv(text, existingVehicles = []) {
    const rows = parseCsv(text);
    if (rows.length === 0) {
        return { error: "The file is empty. Choose the vehicle CSV and try again." };
    }
    if (rows.length - 1 > MAX_ROWS) {
        return { error: `The file has more than ${MAX_ROWS} rows. Split it into smaller files.` };
    }

    const [header, ...dataRows] = rows;
    const indexes = columnIndexes(header);
    const missing = ["registration", "make", "model"].filter((key) => indexes[key] === -1);
    if (missing.length > 0) {
        return { error: "The CSV needs Registration, Make, and Model columns." };
    }

    const existing = new Set(existingVehicles.map((vehicle) => normalizeRegistration(vehicle.registration)));
    const seen = new Set();
    const currentYear = new Date().getFullYear();
    const vehicles = [];
    const duplicates = [];
    const invalid = [];

    dataRows.forEach((row, offset) => {
        const rowNumber = offset + 2;
        const read = (key) => (indexes[key] === -1 ? "" : String(row[indexes[key]] ?? "").trim());
        const registration = normalizeRegistration(read("registration"));
        const make = read("make");
        const model = read("model");

        if (!registration || !make || !model) {
            invalid.push({ row: rowNumber, registration, reason: "Registration, make, and model are required." });
            return;
        }
        if (existing.has(registration) || seen.has(registration)) {
            duplicates.push({ row: rowNumber, registration, reason: "This registration is already in the fleet." });
            return;
        }

        const yearText = read("year");
        const year = yearText ? Number(yearText) : "";
        if (yearText && (!/^\d{4}$/.test(yearText) || year < FIRST_VEHICLE_YEAR || year > currentYear + 1)) {
            invalid.push({ row: rowNumber, registration, reason: `Year must be between ${FIRST_VEHICLE_YEAR} and ${currentYear + 1}.` });
            return;
        }

        const dates = {
            insuranceExpiry: read("insuranceExpiry"),
            roadTaxExpiry: read("roadTaxExpiry"),
            roadworthyExpiry: read("roadworthyExpiry"),
            nextService: read("nextService"),
        };
        const badDate = Object.entries(dates).find(([, value]) => value && !isIsoDate(value));
        if (badDate) {
            invalid.push({ row: rowNumber, registration, reason: `${badDate[0]} must use YYYY-MM-DD.` });
            return;
        }

        seen.add(registration);
        vehicles.push({
            registration,
            make,
            model,
            year,
            colour: read("colour"),
            notes: read("notes"),
            insuranceExpiry: dates.insuranceExpiry,
            roadTaxExpiry: dates.roadTaxExpiry,
            roadworthyExpiry: dates.roadworthyExpiry,
            nextService: dates.nextService,
            status: "Available",
            assignedDriverId: "",
            assignedDriver: "",
        });
    });

    return { vehicles, duplicates, invalid, total: dataRows.length };
}
