import { describe, expect, it } from "vitest";

import { DEFAULT_PREFERENCES, normalizePreferences, preferencesEqual } from "./preferences";

describe("normalizePreferences", () => {
    it("returns defaults for missing or invalid input", () => {
        expect(normalizePreferences()).toEqual(DEFAULT_PREFERENCES);
        expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
        expect(normalizePreferences({ expiryWindow: 999 })).toEqual(DEFAULT_PREFERENCES);
    });

    it("keeps valid values and coerces strings", () => {
        expect(
            normalizePreferences({
                expiryAlerts: false,
                expiryWindow: "60",
                maintenanceReminders: false,
            })
        ).toEqual({
            emailNotifications: false,
            expiryAlerts: false,
            expiryWindow: 60,
            maintenanceReminders: false,
        });
    });
});

describe("preferencesEqual", () => {
    it("compares normalized values", () => {
        expect(preferencesEqual({ expiryWindow: "30" }, DEFAULT_PREFERENCES)).toBe(true);
        expect(preferencesEqual({ expiryWindow: 7 }, DEFAULT_PREFERENCES)).toBe(false);
    });
});
