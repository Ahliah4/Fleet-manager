import { Link } from "react-router-dom";

const variants = {
    primary: "bg-blue-600 text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-600/25",
    secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
    ghost: "bg-white/10 text-white hover:bg-white/20",
    danger: "bg-red-600 text-white shadow-sm shadow-red-600/20 hover:bg-red-700",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
};

function Button({
    children,
    className = "",
    to,
    variant = "primary",
    type = "button",
    ...props
}) {
    const classes = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`;

    if (to) {
        return (
            <Link to={to} className={classes} {...props}>
                {children}
            </Link>
        );
    }

    return (
        <button type={type} className={classes} {...props}>
            {children}
        </button>
    );
}

export default Button;
