import { daysUntil } from "./dates";
import { getCurrentProfile, ownerFields } from "./fleetScope";
import { normalizePreferences } from "./preferences";
import { supabase } from "./supabaseClient";

const DOCUMENTS = [
    {
        field: "insurance_expiry",
        label: "Insurance",
        noun: "insurance",
        preference: "expiryAlerts",
    },
    {
        field: "road_tax_expiry",
        label: "Road Tax",
        noun: "road tax",
        preference: "expiryAlerts",
    },
    {
        field: "roadworthy_expiry",
        label: "Roadworthy",
        noun: "roadworthy",
        preference: "expiryAlerts",
    },
    {
        field: "next_service_date",
        label: "Service",
        noun: "service",
        preference: "maintenanceReminders",
        windowDays: 14,
    },
];

const STATES = ["expired", "soon"];

function isMissingSchema(error) {
    const message = error?.message || "";
    return (
        error?.code === "42703" ||
        error?.code === "PGRST204" ||
        /dedupe_key/i.test(message) ||
        /column .* does not exist/i.test(message)
    );
}

function dedupeKey(vehicle, field, state) {
    return `expiry:${field}:${state}:${vehicle.id}`;
}

function alertTitle(document, state) {
    if (document.field === "next_service_date") {
        return state === "expired" ? "Service Overdue" : "Service Due Soon";
    }

    return `${document.label} ${state === "expired" ? "Expired" : "Expiring Soon"}`;
}

function alertMessage(vehicle, document, state, days) {
    const subject = `${vehicle.make} ${vehicle.model} (${vehicle.registration_number})`;
    const noun = document.noun;

    if (state === "expired") {
        return document.field === "next_service_date"
            ? `${subject} service is overdue.`
            : `${subject} ${noun} has expired.`;
    }

    const suffix = `${days} day${days === 1 ? "" : "s"}`;

    return document.field === "next_service_date"
        ? `${subject} service is due in ${suffix}.`
        : `${subject} ${noun} expires in ${suffix}.`;
}

export function getAlertState(days, windowDays) {
    if (days === null) return null;
    if (days < 0) return "expired";
    if (days <= windowDays) return "soon";
    return null;
}

/**
 * Bring one vehicle's generated alerts in line with its current documents:
 * create/refresh active alerts and remove alerts for documents that were
 * renewed or for categories the user turned off.
 */
export async function syncVehicleAlerts(vehicle, profile, { now = new Date() } = {}) {
    const fleetId = profile?.fleet_id;
    if (!fleetId || !vehicle?.id) return;

    const preferences = normalizePreferences(profile.notification_prefs);

    const { data: existing, error } = await supabase
        .from("notifications")
        .select("id,dedupe_key")
        .eq("fleet_id", fleetId)
        .eq("user_id", profile.id)
        .eq("vehicle_id", vehicle.id)
        .not("dedupe_key", "is", null);

    if (error) {
        if (!isMissingSchema(error)) {
            console.warn("Notification lookup failed:", error.message);
        }
        return;
    }

    const byKey = new Map((existing || []).map((row) => [row.dedupe_key, row]));
    const staleKeys = [];
    const desired = [];

    for (const document of DOCUMENTS) {
        const enabled = preferences[document.preference];
        const days = daysUntil(vehicle[document.field], now);
        const windowDays = document.windowDays
            ? Math.min(document.windowDays, preferences.expiryWindow)
            : preferences.expiryWindow;
        const state = enabled ? getAlertState(days, windowDays) : null;

        for (const candidate of STATES) {
            const key = dedupeKey(vehicle, document.field, candidate);

            if (candidate !== state) staleKeys.push(key);
        }

        if (!state) continue;

        desired.push({
            dedupe_key: dedupeKey(vehicle, document.field, state),
            vehicle_id: vehicle.id,
            title: alertTitle(document, state),
            message: alertMessage(vehicle, document, state, days),
            type: state === "expired" ? "danger" : "warning",
        });
    }

    if (staleKeys.length) {
        const { error: deleteError } = await supabase
            .from("notifications")
            .delete()
            .eq("fleet_id", fleetId)
            .eq("user_id", profile.id)
            .in("dedupe_key", staleKeys);

        if (deleteError && !isMissingSchema(deleteError)) {
            console.warn("Stale notification cleanup failed:", deleteError.message);
        }
    }

    for (const item of desired) {
        const match = byKey.get(item.dedupe_key);

        if (match) {
            // Updating rather than upserting keeps the user's read state.
            const { error: updateError } = await supabase
                .from("notifications")
                .update({
                    title: item.title,
                    message: item.message,
                    type: item.type,
                })
                .eq("id", match.id)
                .eq("fleet_id", fleetId)
                .eq("user_id", profile.id);

            if (updateError) {
                console.warn("Notification refresh failed:", updateError.message);
            }
            continue;
        }

        const { error: insertError } = await supabase.from("notifications").insert({
            ...(await ownerFields()),
            vehicle_id: item.vehicle_id,
            title: item.title,
            message: item.message,
            type: item.type,
            is_read: false,
            dedupe_key: item.dedupe_key,
        });

        // Another device may have inserted the same alert first.
        if (insertError && insertError.code === "23505") {
            await supabase
                .from("notifications")
                .update({
                    title: item.title,
                    message: item.message,
                    type: item.type,
                })
                .eq("fleet_id", fleetId)
                .eq("user_id", profile.id)
                .eq("dedupe_key", item.dedupe_key);
        } else if (insertError && !isMissingSchema(insertError)) {
            console.warn("Notification insert failed:", insertError.message);
        }
    }
}

/**
 * Scans the signed-in user's fleet and synchronises expiry/service alerts.
 * The database also runs this on a schedule, so this client pass mainly makes
 * alerts appear immediately after a fleet change.
 */
export async function checkVehicleAlerts() {
    const profile = await getCurrentProfile();

    // Run even when alerts are disabled: syncVehicleAlerts removes this user's
    // existing generated alerts so turning a category off takes effect.
    const { data: vehicles, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("fleet_id", profile.fleet_id);

    if (error) {
        console.warn("Vehicle alert scan failed:", error.message);
        return;
    }

    const results = await Promise.allSettled(
        (vehicles || []).map((vehicle) => syncVehicleAlerts(vehicle, profile))
    );
    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length) {
        console.warn(`Alert scan could not process ${failures.length} vehicle(s).`);
    }
}

/** Best-effort activity notification; never blocks saving a vehicle. */
export async function notifyVehicleAdded(vehicle) {
    try {
        const { error } = await supabase.from("notifications").insert({
            ...(await ownerFields()),
            vehicle_id: vehicle.id,
            title: "New Vehicle Added",
            message: `${vehicle.make} ${vehicle.model} (${vehicle.registration_number}) was added to the fleet.`,
            type: "success",
            is_read: false,
            dedupe_key: `vehicle:added:${vehicle.id}`,
        });

        if (error && error.code !== "23505" && !isMissingSchema(error)) {
            console.warn("Could not create vehicle notification:", error.message);
        }
    } catch (error) {
        console.warn("Could not create vehicle notification:", error?.message);
    }
}
