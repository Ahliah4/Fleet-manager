import { useEffect, useRef, useState } from "react";

import { supabase } from "./supabaseClient";

/**
 * Re-run `refresh` whenever a row in `table` changes for this fleet. RLS is
 * still enforced by Supabase Realtime, so a user only receives their own
 * fleet's events. If Realtime is not enabled the app simply keeps its
 * load-on-navigate behaviour.
 */
export function useRealtimeRefresh(table, fleetId, refresh) {
    const refreshRef = useRef(refresh);
    // Two components (e.g. the navbar and the notifications page) may watch
    // the same table. Give each hook instance its own channel topic.
    const channelId = useRef(Math.random().toString(36).slice(2));

    useEffect(() => {
        refreshRef.current = refresh;
    }, [refresh]);

    useEffect(() => {
        if (!table || !fleetId) return undefined;

        const channel = supabase
            .channel(`${table}:${fleetId}:${channelId.current}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table,
                    filter: `fleet_id=eq.${fleetId}`,
                },
                () => {
                    try {
                        refreshRef.current?.();
                    } catch (error) {
                        console.warn("Realtime refresh failed:", error?.message);
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fleetId, table]);
}

export function useOnlineStatus() {
    const [online, setOnline] = useState(() =>
        typeof navigator === "undefined" ? true : navigator.onLine
    );

    useEffect(() => {
        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);

        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);

        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    return online;
}
