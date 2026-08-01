import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";


function Login() {

    const { signIn } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);


    const handleSubmit = async (e) => {

        e.preventDefault();
        setError(null);
        setLoading(true);

        const { error } = await signIn(email, password);

        setLoading(false);

        if (error) {
            setError(error.message);
            return;
        }

        navigate("/");

    };


    return (

        <div className="min-h-screen flex items-center justify-center bg-slate-950">

            <form
            onSubmit={handleSubmit}
            className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-sm space-y-6"
            >

                <div>
                    <h1 className="text-3xl font-bold">FleetManager</h1>
                    <p className="text-gray-400 mt-2">Sign in to manage your fleet.</p>
                </div>


                {error && (
                    <div className="bg-red-600/10 border border-red-600/30 text-red-400 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}


                <div>
                    <label className="block text-sm text-gray-400 mb-1">Email</label>
                    <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-600 transition"
                    required
                    />
                </div>


                <div>
                    <label className="block text-sm text-gray-400 mb-1">Password</label>
                    <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-600 transition"
                    required
                    />
                </div>


                <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition px-6 py-3 rounded-xl font-medium"
                >
                    {loading ? "Signing in..." : "Sign In"}
                </button>


            </form>

        </div>

    );

}

export default Login;