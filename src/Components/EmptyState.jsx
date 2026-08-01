function EmptyState({ title, message, action }) {
    return (
        <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center">
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

