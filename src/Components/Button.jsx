import { Link } from "react-router-dom";

const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white text-slate-900 hover:bg-blue-50 border border-blue-100",
    ghost: "bg-white/10 text-white hover:bg-white/20",
    danger: "bg-red-600 text-white hover:bg-red-700",
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
    const classes = `inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg disabled:opacity-50 disabled:hover:scale-100 ${variants[variant]} ${className}`;

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

