export const EXPIRY_WINDOWS = [7, 14, 30, 60, 90];

export const DEFAULT_PREFERENCES = Object.freeze({
    emailNotifications: false,
    expiryAlerts: true,
    expiryWindow: 30,
    maintenanceReminders: true,
});

function toBoolean(value, fallback) {
    return typeof value === "boolean" ? value : fallback;
}

/**
 * The database stores preferences as jsonb. Accept anything (missing column,
 * old row, hand-edited value) and return a complete, valid object.
 */
export function normalizePreferences(value) {
    const raw = value && typeof value === "object" ? value : {};
    const window = Number(raw.expiryWindow);

    return {
        emailNotifications: toBoolean(raw.emailNotifications, DEFAULT_PREFERENCES.emailNotifications),
        expiryAlerts: toBoolean(raw.expiryAlerts, DEFAULT_PREFERENCES.expiryAlerts),
        expiryWindow: EXPIRY_WINDOWS.includes(window) ? window : DEFAULT_PREFERENCES.expiryWindow,
        maintenanceReminders: toBoolean(raw.maintenanceReminders, DEFAULT_PREFERENCES.maintenanceReminders),
    };
}

export function preferencesEqual(a, b) {
    const left = normalizePreferences(a);
    const right = normalizePreferences(b);

    return Object.keys(DEFAULT_PREFERENCES).every((key) => left[key] === right[key]);
}
