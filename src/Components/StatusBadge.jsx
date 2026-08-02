const statusClasses = {
    active: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dueSoon: "border-amber-200 bg-amber-50 text-amber-700",
    expired: "border-red-200 bg-red-50 text-red-700",
    missing: "bg-slate-100 text-slate-600 border-slate-200",
    unread: "bg-blue-100 text-blue-700 border-blue-200",
    read: "bg-slate-100 text-slate-600 border-slate-200",
};

function StatusBadge({ children, type = "active", className = "" }) {
    return (
        <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[type] || statusClasses.active} ${className}`}>
            {children}
        </span>
    );
}

export default StatusBadge;
