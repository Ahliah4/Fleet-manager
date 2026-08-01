import { useEffect, useMemo, useState } from "react";
import { Bell, LogOut, Search, UserCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/authContext";
import { supabase } from "../lib/supabaseClient";


function Navbar() {

    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [showProfile, setShowProfile] = useState(false);
    const [search, setSearch] = useState("");
    const initial = user?.email?.[0]?.toUpperCase() || "?";

    useEffect(() => {
        async function fetchUnread() {
            const { data } = await supabase
                .from("notifications")
                .select("id,title,message,is_read,created_at")
                .eq("is_read", false)
                .order("created_at", { ascending: false })
                .limit(5);

            setNotifications(data || []);
        }

        fetchUnread();
    }, []);

    const suggestions = useMemo(() => {
        if (!search.trim()) return [];
        return ["Vehicles", "Reports", "Notifications", "Add Vehicle"]
            .filter((item) => item.toLowerCase().includes(search.toLowerCase()))
            .slice(0, 3);
    }, [search]);

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };


    return (

        <header className="flex items-center justify-between border-b border-gray-100 bg-white px-8 py-4">

            <div className="relative w-full max-w-md">

                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />

                <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="text"
                placeholder="Search anything..."
                className="w-full bg-gray-100 rounded-xl pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
                />

                {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-14 z-20 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
                        {suggestions.map((item) => (
                            <div key={item} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-blue-50">
                                {item}
                            </div>
                        ))}
                    </div>
                )}

            </div>


            <div className="flex items-center gap-6 ml-6">

                <Link
                to="/notifications"
                className="relative text-gray-500 transition-all duration-300 hover:scale-110 hover:text-blue-500"
                >
                    <Bell size={22} />
                    {notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                            {notifications.length}
                        </span>
                    )}
                </Link>

                <div className="relative">

                    <button
                    onClick={() => setShowProfile((value) => !value)}
                    className="flex items-center gap-3 rounded-xl px-2 py-1 transition-all duration-300 hover:scale-105 hover:bg-blue-50"
                    >
                        <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium">
                            {initial}
                        </div>

                        <span className="text-gray-700 text-sm font-medium hidden sm:block">
                            {user?.email}
                        </span>
                    </button>

                    {showProfile && (
                        <div className="absolute right-0 top-12 z-20 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
                            <div className="border-b border-gray-100 px-3 py-2">
                                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                    <UserCircle size={18} />
                                    Profile
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-500">{user?.email}</p>
                            </div>
                            <button
                            onClick={handleSignOut}
                            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
                            >
                                <LogOut size={16} />
                                Sign out
                            </button>
                        </div>
                    )}

                </div>

            </div>

        </header>

    );

}


export default Navbar;
