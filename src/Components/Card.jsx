function Card({ children, className = "" }) {
    return (
        <div className={`rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl ${className}`}>
            {children}
        </div>
    );
}

export default Card;

