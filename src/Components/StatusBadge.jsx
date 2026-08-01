const statusClasses = {
    active: "bg-green-100 text-green-700 border-green-200",
    dueSoon: "bg-yellow-100 text-yellow-700 border-yellow-200",
    expired: "bg-red-100 text-red-700 border-red-200",
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

