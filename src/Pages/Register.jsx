import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import BrandLogo from "../Components/BrandLogo";

function Register() {
    const { signUp } = useAuth();
    const navigate = useNavigate();

    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError(null);
        setSuccess(null);

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }

        setLoading(true);

        const { data, error } = await signUp(
            email,
            password,
            fullName
        );

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        if (data?.session) {
            // Email confirmation is disabled; the user is signed in already.
            navigate("/", { replace: true });
            return;
        }

        setSuccess("Account created! Check your email to confirm it, then sign in.");

        setTimeout(() => {
            navigate("/login");
        }, 2000);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950 via-slate-950 to-slate-950 p-4 sm:p-6">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8"
            >
                <div className="text-center">
                    <BrandLogo />
                    <h1 className="text-3xl font-bold tracking-tight text-white">
                        Create Account
                    </h1>

                    <p className="mt-2 text-sm text-gray-400">
                        Create your IP Motors fleet account.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-600/10 border border-red-600/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-600/10 border border-green-600/30 text-green-400 rounded-xl px-4 py-3 text-sm">
                        {success}
                    </div>
                )}

                <div>
                    <label htmlFor="full-name" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Full Name
                    </label>

                    <input
                        id="full-name" type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        placeholder="John Doe"
                        required
                    />
                </div>

                <div>
                    <label htmlFor="register-email" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Email
                    </label>

                    <input
                        id="register-email" type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        required
                    />
                </div>

                <div>
                    <label htmlFor="register-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Password
                    </label>

                    <div className="relative"><input
                        id="register-password" type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        required
                    /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                </div>

                <div>
                    <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Confirm Password
                    </label>

                    <div className="relative"><input
                        id="confirm-password" type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        required
                    /><button type="button" aria-label={showConfirmPassword ? "Hide password" : "Show password"} onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white">{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? "Creating Account..." : "Create Account"}
                </button>

                <div className="text-center text-sm text-gray-400">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                        Sign In
                    </Link>
                </div>
            </form>
        </div>
    );
}

export default Register;
