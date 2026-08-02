function Card({ children, className = "" }) {
    return (
        <div className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/[0.03] transition duration-200 sm:p-6 ${className}`}>
            {children}
        </div>
    );
}

export default Card;
