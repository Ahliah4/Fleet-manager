function BrandLogo({ compact = false }) {
    if (compact) {
        return (
            <div className="flex min-w-0 items-center gap-3">
                <img
                    src="/ip-motors-mark.webp"
                    alt=""
                    aria-hidden="true"
                    className="h-12 w-[76px] shrink-0 rounded-lg bg-black object-contain"
                />
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold tracking-wide text-white">IP Motors</p>
                    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        Fleet Manager
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto mb-5 flex h-[136px] w-full max-w-[260px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black px-2 shadow-lg shadow-black/20">
            <img
                src="/ip-motors-logo.webp"
                alt="IP Motors and Logistics"
                className="max-h-full w-full object-contain"
            />
        </div>
    );
}

export default BrandLogo;
