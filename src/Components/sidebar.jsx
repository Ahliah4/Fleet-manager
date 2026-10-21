import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Car,
  PlusCircle,
  FileText,
  Settings,
  LogOut,
  Bell, Users, X
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import BrandLogo from "./BrandLogo";


function Sidebar({ open, onClose }) {

    const { signOut } = useAuth();
    const navigate = useNavigate();

    const menuItems = [
        { name: "Dashboard", path: "/", icon: LayoutDashboard },
        { name: "Vehicles", path: "/vehicles", icon: Car },
        { name: "Add Vehicle", path: "/add-vehicle", icon: PlusCircle },
        { name: "Notifications", path: "/notifications", icon: Bell },
        { name: "Reports", path: "/reports", icon: FileText },
        { name: "Team", path: "/team", icon: Users },
        { name: "Settings", path: "/settings", icon: Settings },
    ];

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };


    return (
        <>
        {open && <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={onClose} />}
        <aside className={`fixed inset-y-0 left-0 z-50 flex min-h-screen w-72 flex-col border-r border-slate-800 bg-slate-950 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:z-0 lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}>

            <div className="mb-8 flex items-center justify-between gap-2 px-1">
              <BrandLogo compact />
              <button aria-label="Close navigation" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"><X size={18} /></button>
            </div>


            <nav aria-label="Main navigation" className="flex-1 space-y-1">

                {menuItems.map((item) => {

                    const Icon = item.icon;

                    return (

                        <NavLink
                        key={item.name}
                        to={item.path}
                        end={item.path === "/"}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200
                            ${isActive
                                ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30"
                                : "text-slate-400 hover:bg-white/10 hover:text-white"
                            }`
                        }
                        >

                            <Icon size={20} />

                            <span>{item.name}</span>

                        </NavLink>

                    );

                })}

            </nav>


            <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
            >

                <LogOut size={20} />

                <span>Sign Out</span>

            </button>


        </aside>
        </>

    );

}


export default Sidebar;
