import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/authContext";
import BrandLogo from "../Components/BrandLogo";

function ResetPassword() {
    const { user, loading: authLoading, updatePassword, signOut } = useAuth();
    const navigate = useNavigate();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError("Use at least 8 characters for your new password.");
            return;
        }

        if (password !== confirmPassword) {
            setError("The passwords do not match.");
            return;
        }

        setSaving(true);

        try {
            const { error: updateError } = await updatePassword(password);

            if (updateError) {
                setError(updateError.message || "Could not update your password.");
                return;
            }

            // Force a fresh sign-in so the user confirms the new password.
            await signOut();
            navigate("/login?passwordUpdated=1", { replace: true });
        } catch (updateError) {
            setError(updateError?.message || "Could not update your password.");
        } finally {
            setSaving(false);
        }
    };

    if (authLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
                Checking your reset link…
            </div>
        );
    }

    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 sm:p-6">
                <section className="w-full max-w-md space-y-4 rounded-3xl border border-white/10 bg-slate-900/90 p-6 text-center shadow-2xl sm:p-8">
                    <h1 className="text-2xl font-bold text-white">Reset link expired</h1>
                    <p className="text-sm leading-6 text-slate-400">
                        This link is invalid or has expired. Return to sign in and request a new reset link.
                    </p>
                    <Link
                        to="/login"
                        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500"
                    >
                        Back to sign in
                    </Link>
                </section>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-950 via-slate-950 to-slate-950 p-4 sm:p-6">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-5 rounded-3xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl shadow-black/20 backdrop-blur sm:p-8"
            >
                <div className="text-center">
                    <BrandLogo />
                    <h1 className="text-3xl font-bold tracking-tight text-white">Choose a new password</h1>
                    <p className="mt-2 text-sm text-slate-400">Set a new password for {user.email}.</p>
                </div>

                {error && (
                    <div role="alert" className="rounded-xl border border-red-600/30 bg-red-600/10 px-4 py-3 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-300">New password</span>
                    <span className="relative block">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        />
                        <button
                            type="button"
                            aria-label={showPassword ? "Hide new password" : "Show new password"}
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </span>
                </label>

                <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-300">Confirm new password</span>
                    <span className="relative block">
                        <input
                            type={showConfirmPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-12 text-white outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15"
                        />
                        <button
                            type="button"
                            aria-label={showConfirmPassword ? "Hide confirmation" : "Show confirmation"}
                            onClick={() => setShowConfirmPassword((value) => !value)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-white"
                        >
                            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </span>
                </label>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? "Updating password…" : "Update password"}
                </button>
            </form>
        </div>
    );
}

export default ResetPassword;
