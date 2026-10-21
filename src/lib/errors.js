/**
 * Turns a Supabase/PostgREST error into something useful to show in the UI.
 * The full message is important: it tells us whether the problem is RLS,
 * a missing column or a network failure.
 */
export function describeError(error, fallback = "Something went wrong.") {
    if (!error) return fallback;

    const message = error.message || error.error_description || fallback;
    const meta = [
        error.code ? `code ${error.code}` : null,
        error.details || null,
        error.hint || null,
    ].filter(Boolean);

    return meta.length ? `${message} (${meta.join(" · ")})` : message;
}
