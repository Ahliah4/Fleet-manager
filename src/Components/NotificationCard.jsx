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
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl">
            <div className="flex gap-4">
                <div className="h-fit rounded-xl bg-blue-50 p-3 text-blue-600">
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

                        <StatusBadge type={notification.is_read ? "read" : "unread"}>
                            {notification.is_read ? "Read" : "Unread"}
                        </StatusBadge>
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
        </div>
    );
}

export default NotificationCard;

