import { useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";

import Button from "../Components/Button";
import EmptyState from "../Components/EmptyState";
import Loader from "../Components/Loader";
import NotificationCard from "../Components/NotificationCard";
import { supabase } from "../lib/supabaseClient";

function Notifications() {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchNotifications = async () => {
        const { data, error: fetchError } = await supabase
            .from("notifications")
            .select("*")
            .order("created_at", { ascending: false });

        if (fetchError) {
            setError("Failed to load notifications.");
        } else {
            setNotifications(data || []);
        }

        setLoading(false);
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markRead = async (id) => {
        const { error: updateError } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("id", id);

        if (!updateError) {
            setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item));
        }
    };

    const markAllRead = async () => {
        const { error: updateError } = await supabase
            .from("notifications")
            .update({ is_read: true })
            .eq("is_read", false);

        if (!updateError) {
            setNotifications((items) => items.map((item) => ({ ...item, is_read: true })));
        }
    };

    const deleteNotification = async (id) => {
        const { error: deleteError } = await supabase
            .from("notifications")
            .delete()
            .eq("id", id);

        if (!deleteError) {
            setNotifications((items) => items.filter((item) => item.id !== id));
        }
    };

    const unreadCount = notifications.filter((item) => !item.is_read).length;

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="page-title">
                        Notifications
                    </h1>
                    <p className="page-description">
                        Track document alerts and fleet activity.
                    </p>
                </div>

                <Button onClick={markAllRead} disabled={unreadCount === 0}>
                    <CheckCheck size={18} />
                    Mark all as read
                </Button>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
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
            ) : (
                <div className="space-y-4">
                    {notifications.map((notification) => (
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
