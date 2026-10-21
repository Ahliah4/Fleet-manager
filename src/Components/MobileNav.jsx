import { NavLink } from "react-router-dom";
import { Car, FileText, LayoutDashboard, Menu, Plus } from "lucide-react";

const linkClass = ({ isActive }) =>
    `flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition ${
        isActive ? "text-blue-600" : "text-slate-500 hover:text-slate-900"
    }`;

function MobileNav({ onMenuClick }) {
    return (
        <nav
            aria-label="Mobile navigation"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden"
        >
            <div className="grid grid-cols-5 items-end px-2 pt-1.5">
                <NavLink to="/" end className={linkClass}>
                    <LayoutDashboard size={20} />
                    Home
                </NavLink>

                <NavLink to="/vehicles" className={linkClass}>
                    <Car size={20} />
                    Vehicles
                </NavLink>

                <NavLink
                    to="/add-vehicle"
                    aria-label="Add vehicle"
                    className="flex flex-col items-center justify-center"
                >
                    {({ isActive }) => (
                        <span
                            className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition ${
                                isActive
                                    ? "bg-blue-700 shadow-blue-700/30"
                                    : "bg-blue-600 shadow-blue-600/30"
                            }`}
                        >
                            <Plus size={26} />
                        </span>
                    )}
                </NavLink>

                <NavLink to="/reports" className={linkClass}>
                    <FileText size={20} />
                    Reports
                </NavLink>

                <button type="button" onClick={onMenuClick} className="flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium text-slate-500 transition hover:text-slate-900">
                    <Menu size={20} />
                    More
                </button>
            </div>
        </nav>
    );
}

export default MobileNav;
