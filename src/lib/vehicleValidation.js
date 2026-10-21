import { parseLocalDate } from "./dates";

const DATE_FIELDS = [
    ["insurance_expiry", "insurance expiry"],
    ["road_tax_expiry", "road tax expiry"],
    ["roadworthy_expiry", "roadworthy expiry"],
    ["next_service_date", "next service date"],
];

function clean(value) {
    return String(value ?? "").trim();
}

/**
 * Field-level validation shared by Add and Edit so both forms behave the same.
 * Returns `{ errors, isValid }`; `errors` is keyed by form field name.
 */
export function validateVehicle(values = {}, { now = new Date() } = {}) {
    const errors = {};

    const registration = clean(values.registration_number);
    const make = clean(values.make);
    const model = clean(values.model);
    const notes = clean(values.notes);
    const yearText = clean(values.year);

    if (!registration) {
        errors.registration_number = "Registration number is required.";
    } else if (registration.length > 24) {
        errors.registration_number = "Registration number must be 24 characters or fewer.";
    }

    if (!make) {
        errors.make = "Make is required.";
    } else if (make.length > 60) {
        errors.make = "Make must be 60 characters or fewer.";
    }

    if (!model) {
        errors.model = "Model is required.";
    } else if (model.length > 60) {
        errors.model = "Model must be 60 characters or fewer.";
    }

    const year = Number(yearText);

    if (!yearText) {
        errors.year = "Year is required.";
    } else if (!Number.isInteger(year) || year < 1900 || year > now.getFullYear() + 1) {
        errors.year = `Enter a year between 1900 and ${now.getFullYear() + 1}.`;
    }

    for (const [field, label] of DATE_FIELDS) {
        const value = clean(values[field]);

        if (value && !parseLocalDate(value)) {
            errors[field] = `Enter a valid ${label} (YYYY-MM-DD).`;
        }
    }

    if (notes.length > 2000) {
        errors.notes = "Notes must be 2000 characters or fewer.";
    }

    return { errors, isValid: Object.keys(errors).length === 0 };
}

/** Turn `{ field: message }` from Supabase into a readable summary. */
export function firstError(errors) {
    return Object.values(errors || {})[0] || null;
}
