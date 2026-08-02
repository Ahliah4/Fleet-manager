import { AlertTriangle, Bell, CheckCircle, Trash2 } from "lucide-react";

import Button from "./Button";
import StatusBadge from "./StatusBadge";

const icons = {
    success: CheckCircle,
    warning: AlertTriangle,
    danger: AlertTriangle,
};

function formatNotificationDate(value) {
    if (!value) return "Recently";

    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function NotificationCard({ notification, onMarkRead, onDelete }) {
    const Icon = icons[notification.type] || Bell;

    return (
        <article className={`rounded-2xl border bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${notification.is_read ? "border-slate-200" : "border-blue-200 shadow-blue-950/[0.04]"}`}>
            <div className="flex gap-4">
                <div className={`h-fit rounded-xl p-3 ${notification.is_read ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                    <Icon size={22} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="font-bold text-slate-900">
                                {notification.title}
                            </h3>
                            <p className="mt-1 text-sm text-slate-500">
                                {notification.message}
                            </p>
                        </div>

                        <div className="flex items-center gap-2"><StatusBadge type={notification.is_read ? "read" : "unread"}>{notification.is_read ? "Read" : "Unread"}</StatusBadge>{!notification.is_read && <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread notification" />}</div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-400">
                            {formatNotificationDate(notification.created_at)}
                        </p>

                        <div className="flex gap-2">
                            {!notification.is_read && (
                                <Button
                                    variant="secondary"
                                    className="px-3 py-2 text-xs"
                                    onClick={() => onMarkRead(notification.id)}
                                >
                                    Mark read
                                </Button>
                            )}

                            <Button
                                variant="subtle"
                                className="px-3 py-2 text-xs text-red-600"
                                onClick={() => onDelete(notification.id)}
                            >
                                <Trash2 size={14} />
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    );
}

export default NotificationCard;
