const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parse a date-only value ("2026-10-19") as local midnight. Parsing it as
 * `new Date("2026-10-19")` treats it as UTC, which shifts the day for users
 * west of Greenwich. Invalid calendar dates such as 2026-02-31 are rejected
 * instead of silently rolling into March.
 */
export function parseLocalDate(value) {
    if (value === null || value === undefined || value === "") return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }

    const text = String(value).trim();
    const match = DATE_ONLY.exec(text);

    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(year, month - 1, day);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        return date;
    }

    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function startOfToday(now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Whole calendar days from today to `value`; negative means in the past. */
export function daysUntil(value, now = new Date()) {
    const date = parseLocalDate(value);
    if (!date) return null;

    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((target.getTime() - startOfToday(now).getTime()) / DAY_MS);
}

export function isValidDateInput(value) {
    return value === "" || value === null || value === undefined || parseLocalDate(value) !== null;
}

export function formatDate(value, fallback = "Not set") {
    const date = parseLocalDate(value);
    if (!date) return fallback;

    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(date);
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayInputValue(now = new Date()) {
    const date = startOfToday(now);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
