function BrandLogo({ compact = false }) {
    if (compact) {
        return (
            <div className="flex min-w-0 items-center gap-3">
                <span className="relative grid h-12 w-[76px] shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 bg-black shadow-inner shadow-black/50">
                    <span className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent" />
                    <img
                        src="/ip-motors-mark.webp"
                        alt=""
                        aria-hidden="true"
                        className="h-full w-full object-contain"
                    />
                </span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold tracking-wide text-white">IP Motors</p>
                    <div className="mt-1 flex items-center gap-1.5">
                        <span className="h-1 w-4 rounded-full bg-brand-500" />
                        <p className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Fleet Manager
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative mx-auto mb-5 flex h-[144px] w-full max-w-[280px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black px-2 shadow-xl shadow-black/30 ring-1 ring-brand-500/15">
            <span className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/80 to-transparent" />
            <span className="absolute -top-8 left-1/2 h-16 w-40 -translate-x-1/2 rounded-full bg-brand-600/10 blur-2xl" />
            <img
                src="/ip-motors-logo.webp"
                alt="IP Motors and Logistics"
                className="relative max-h-full w-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)]"
            />
        </div>
    );
}

export default BrandLogo;
