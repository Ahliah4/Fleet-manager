import { useState } from "react";
import { Eye, EyeOff, Mail } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import BrandLogo from "../Components/BrandLogo";

function Login() {
    const { signIn, resetPassword } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(() =>
        new URLSearchParams(window.location.search).get("passwordUpdated")
            ? "Your password has been updated. Sign in with your new password."
            : null
    );
    const [loading, setLoading] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        setError(null);
        setNotice(null);
        setLoading(true);

        const { error } = await signIn(email, password);

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        navigate("/");
    };

    const handleForgotPassword = async () => {
        setError(null);
        setNotice(null);

        if (!email.trim()) {
            setError("Enter your email address first, then tap “Forgot password”.");
            return;
        }

        setResetting(true);
        try {
            const { error: resetError } = await resetPassword(email.trim());

            if (resetError) {
                setError(resetError.message);
                return;
            }

            setNotice(`If an account exists for ${email.trim()}, a password reset link will be sent. Check your inbox.`);
        } catch (resetError) {
            setError(resetError?.message || "Could not send the password reset email.");
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950 via-slate-950 to-slate-950 p-4 sm:p-6">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8"
            >
                <div className="text-center">
                    <BrandLogo />
                    <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">IP Motors Fleet Manager</h1>

                    <p className="mt-2 text-sm text-gray-400">
                        Sign in to manage your vehicles and fleet documents.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-600/10 border border-red-600/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {notice && (
                    <div className="bg-emerald-600/10 border border-emerald-600/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">
                        {notice}
                    </div>
                )}

                <div>
                    <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Email
                    </label>

                    <div className="relative"><Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={17} /><input
                        id="login-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-11 pr-4 text-white outline-none transition placeholder:text-slate-500 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        required
                    /></div>
                </div>

                <div>
                    <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Password
                    </label>

                    <div className="relative"><input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        required
                    /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>

                    <div className="mt-2 text-right">
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            disabled={resetting}
                            className="text-xs font-medium text-slate-400 transition hover:text-blue-400"
                        >
                            {resetting ? "Sending reset link…" : "Forgot password?"}
                        </button>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? "Signing in..." : "Sign In"}
                </button>

                <div className="text-center text-sm text-gray-400">
                    Don't have an account?{" "}
                    <Link
                        to="/register"
                        className="text-blue-400 hover:text-blue-300 font-medium"
                    >
                        Create Account
                    </Link>
                </div>
            </form>
        </div>
    );
}

export default Login;
