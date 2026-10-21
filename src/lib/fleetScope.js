import { supabase } from "./supabaseClient";

// One profile lookup per signed-in session. Every fleet query uses the same
// fleet_id, so caching it avoids a round-trip on each page.
let cachedProfile = null;
let inflight = null;

export function clearFleetCache() {
    cachedProfile = null;
    inflight = null;
}

export function updateCachedProfile(patch) {
    if (!cachedProfile || !patch) return;
    cachedProfile = { ...cachedProfile, ...patch };
}

function isMissingSchema(error) {
    const code = error?.code;
    const message = error?.message || "";

    return (
        code === "42P01" || // undefined_table
        code === "42703" || // undefined_column
        code === "PGRST204" ||
        code === "PGRST205" ||
        /could not find the table/i.test(message) ||
        /column .* does not exist/i.test(message)
    );
}

export function describeSetupError(error) {
    const detail = error?.message || "missing fleet data";
    const missingProfile = /public\.profiles|profiles.*schema cache|table .*profiles/i.test(detail);

    if (missingProfile) {
        return new Error(
            "Supabase cannot find public.profiles. Run the complete supabase/schema.sql in the SQL Editor for the same project configured in this app, then run supabase/verify-setup.sql. If the table exists but REST still reports a schema-cache error, run NOTIFY pgrst, 'reload schema'; and reload the app. " +
                `(${detail})`
        );
    }

    return new Error(
        "Your account is not fully set up. Run supabase/schema.sql in the Supabase SQL editor, then reload. " +
            `(${detail})`
    );
}

async function loadProfile() {
    const {
        data: { user },
        error: authError,
    } = await supabase.auth.getUser();

    if (authError) throw authError;
    if (!user) throw new Error("Your session has expired. Please sign in again.");

    const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,fleet_id,notification_prefs")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        if (isMissingSchema(error)) throw describeSetupError(error);
        throw error;
    }

    if (!data) throw describeSetupError({ message: "profile row missing" });
    if (!data.fleet_id) throw describeSetupError({ message: "fleet_id missing" });

    return data;
}

export async function getCurrentProfile({ force = false } = {}) {
    if (!force && cachedProfile) return cachedProfile;
    if (!force && inflight) return inflight;

    inflight = loadProfile()
        .then((profile) => {
            cachedProfile = profile;
            return profile;
        })
        .finally(() => {
            inflight = null;
        });

    return inflight;
}

/** Scope a query to the signed-in user's fleet. Never falls back to unscoped. */
export async function applyFleetScope(query) {
    const profile = await getCurrentProfile();
    return query.eq("fleet_id", profile.fleet_id);
}

/** Owner + fleet columns for inserts. user_id records who created the row. */
export async function ownerFields() {
    const profile = await getCurrentProfile();
    return { user_id: profile.id, fleet_id: profile.fleet_id };
}

export async function getCurrentUserId() {
    const profile = await getCurrentProfile();
    return profile.id;
}
