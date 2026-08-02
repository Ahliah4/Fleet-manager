import { useEffect, useMemo, useState } from "react";
import { Bell, LogOut, Menu, Search, UserCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/authContext";
import { supabase } from "../lib/supabaseClient";


function Navbar({ onMenuClick }) {

    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [showProfile, setShowProfile] = useState(false);
    const [search, setSearch] = useState("");
    const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
    const initials = userName.split(" ").map((name) => name[0]).join("").slice(0, 2).toUpperCase();

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

        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">

            <button aria-label="Open navigation" onClick={onMenuClick} className="mr-3 rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu size={20} /></button>

            <div className="relative hidden w-full max-w-md sm:block">

                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />

                <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="text"
                placeholder="Search anything..."
                className="w-full rounded-xl border border-transparent bg-slate-100 py-2.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-200 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                />

                {suggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-14 z-20 rounded-xl border border-gray-100 bg-white p-2 shadow-xl">
                        {suggestions.map((item) => (
                            <Link to={item === "Add Vehicle" ? "/add-vehicle" : `/${item.toLowerCase()}`} key={item} onClick={() => setSearch("")} className="block rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-blue-50">
                                {item}
                            </Link>
                        ))}
                    </div>
                )}

            </div>


            <div className="ml-auto flex items-center gap-2 sm:gap-4">

                <Link
                to="/notifications"
                aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ""}`}
                className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
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
                    aria-expanded={showProfile}
                    className="flex items-center gap-3 rounded-xl p-1.5 transition hover:bg-slate-100"
                    >
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm">
                            {initials}
                        </div>

                        <span className="text-gray-700 text-sm font-medium hidden sm:block">
                            {userName}
                        </span>
                    </button>

                    {showProfile && (
                        <div className="absolute right-0 top-12 z-20 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-950/10">
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
