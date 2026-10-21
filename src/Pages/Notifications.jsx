import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";

import Button from "../Components/Button";
import EmptyState from "../Components/EmptyState";
import Loader from "../Components/Loader";
import NotificationCard from "../Components/NotificationCard";
import { describeError } from "../lib/errors";
import { applyFleetScope, getCurrentProfile } from "../lib/fleetScope";
import { useRealtimeRefresh } from "../lib/hooks";
import { supabase } from "../lib/supabaseClient";

const FILTERS = [
    { label: "All", value: "all" },
    { label: "Unread", value: "unread" },
];

function Notifications() {
    const [notifications, setNotifications] = useState([]);
    const [profile, setProfile] = useState(null);
    const [filter, setFilter] = useState("all");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionError, setActionError] = useState(null);

    const loadNotifications = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);

        try {
            const current = await getCurrentProfile();
            setProfile(current);

            let query = supabase.from("notifications").select("*");
            query = await applyFleetScope(query);
            query = query.eq("user_id", current.id);

            const { data, error: fetchError } = await query.order("created_at", {
                ascending: false,
            });

            if (fetchError) {
                setError(describeError(fetchError, "Failed to load notifications."));
            } else {
                setNotifications(data || []);
                setError(null);
            }
        } catch (loadError) {
            setError(describeError(loadError, "Failed to load notifications."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadNotifications();
    }, [loadNotifications]);

    useRealtimeRefresh("notifications", profile?.fleet_id, () =>
        loadNotifications({ silent: true })
    );

    const markRead = async (id) => {
        if (!profile?.id) return;
        setActionError(null);

        try {
            let query = supabase
                .from("notifications")
                .update({ is_read: true })
                .eq("id", id);

            query = await applyFleetScope(query);
            query = query.eq("user_id", profile.id);

            const { error: updateError } = await query;

            if (updateError) {
                setActionError(describeError(updateError, "Could not mark the notification as read."));
                return;
            }

            setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
        } catch (updateError) {
            setActionError(describeError(updateError, "Could not mark the notification as read."));
        }
    };

    const markAllRead = async () => {
        if (!profile?.id) return;
        setActionError(null);

        try {
            let query = supabase
                .from("notifications")
                .update({ is_read: true })
                .eq("is_read", false);

            query = await applyFleetScope(query);
            query = query.eq("user_id", profile.id);

            const { error: updateError } = await query;

            if (updateError) {
                setActionError(describeError(updateError, "Could not update notifications."));
                return;
            }

            setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
        } catch (updateError) {
            setActionError(describeError(updateError, "Could not update notifications."));
        }
    };

    const deleteNotification = async (id) => {
        if (!profile?.id) return;
        setActionError(null);

        try {
            let query = supabase
                .from("notifications")
                .delete()
                .eq("id", id);

            query = await applyFleetScope(query);
            query = query.eq("user_id", profile.id);

            const { error: deleteError } = await query;

            if (deleteError) {
                setActionError(describeError(deleteError, "Could not delete the notification."));
                return;
            }

            setNotifications((items) => items.filter((item) => item.id !== id));
        } catch (deleteError) {
            setActionError(describeError(deleteError, "Could not delete the notification."));
        }
    };

    const unreadCount = notifications.filter((item) => !item.is_read).length;
    const visible = filter === "unread"
        ? notifications.filter((item) => !item.is_read)
        : notifications;

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="page-title">
                        Notifications
                    </h1>
                    <p className="page-description">
                        Document alerts, service reminders, and fleet activity.
                    </p>
                </div>

                <Button onClick={markAllRead} disabled={unreadCount === 0}>
                    <CheckCheck size={18} />
                    Mark all as read
                </Button>
            </div>

            {(error || actionError) && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error || actionError}
                </div>
            )}

            {!loading && notifications.length > 0 && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter notifications">
                    {FILTERS.map((item) => {
                        const count = item.value === "unread" ? unreadCount : notifications.length;

                        return (
                            <button
                                key={item.value}
                                type="button"
                                onClick={() => setFilter(item.value)}
                                aria-pressed={filter === item.value}
                                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                                    filter === item.value
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                            >
                                {item.label} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            {loading ? (
                <Loader rows={5} />
            ) : notifications.length === 0 ? (
                <EmptyState
                    title="No notifications"
                    message="Fleet alerts and document reminders will appear here."
                    action={<Button to="/vehicles">View Vehicles</Button>}
                />
            ) : visible.length === 0 ? (
                <EmptyState
                    title="You're all caught up"
                    message="There are no unread notifications."
                    action={
                        <Button variant="secondary" onClick={() => setFilter("all")}>
                            View all notifications
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-4">
                    {visible.map((notification) => (
                        <NotificationCard
                            key={notification.id}
                            notification={notification}
                            onMarkRead={markRead}
                            onDelete={deleteNotification}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

export default Notifications;
