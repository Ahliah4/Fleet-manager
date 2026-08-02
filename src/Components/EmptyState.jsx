function EmptyState({ title, message, action }) {
    return (
        <div className="rounded-2xl border border-dashed border-blue-200 bg-gradient-to-br from-blue-50 to-white p-8 text-center shadow-sm sm:p-12">
            <h3 className="text-lg font-semibold text-slate-900">
                {title}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                {message}
            </p>
            {action && (
                <div className="mt-5">
                    {action}
                </div>
            )}
        </div>
    );
}

export default EmptyState;
