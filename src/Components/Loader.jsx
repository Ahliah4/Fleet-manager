function Loader({ rows = 3 }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, index) => (
                <div
                    key={index}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                />
            ))}
        </div>
    );
}

export default Loader;

