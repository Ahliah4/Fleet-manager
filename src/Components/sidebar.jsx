import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Car,
  PlusCircle,
  FileText,
  Settings,
  LogOut,
  Bell
} from "lucide-react";
import { useAuth } from "../lib/authContext";


function Sidebar() {

    const { signOut } = useAuth();
    const navigate = useNavigate();

    const menuItems = [
        { name: "Dashboard", path: "/", icon: LayoutDashboard },
        { name: "Vehicles", path: "/vehicles", icon: Car },
        { name: "Add Vehicle", path: "/add-vehicle", icon: PlusCircle },
        { name: "Notifications", path: "/notifications", icon: Bell },
        { name: "Reports", path: "/reports", icon: FileText },
        { name: "Settings", path: "/settings", icon: Settings },
    ];

    const handleSignOut = async () => {
        await signOut();
        navigate("/login");
    };


    return (

        <aside className="w-72 min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 p-6 flex flex-col text-white">

            <div className="flex items-center gap-3 mb-10">

                <div className="bg-white/20 p-2 rounded-xl">
                    <Car size={24} />
                </div>

                <h1 className="text-xl font-bold">
                    Fleet Manager
                </h1>

            </div>


            <nav className="space-y-2 flex-1">

                {menuItems.map((item) => {

                    const Icon = item.icon;

                    return (

                        <NavLink
                        key={item.name}
                        to={item.path}
                        end={item.path === "/"}
                        className={({ isActive }) =>
                            `flex items-center gap-4 px-5 py-3 rounded-xl transition-all duration-300
                            ${isActive
                                ? "bg-white text-blue-700 shadow-md font-medium"
                                : "text-blue-100 hover:bg-white/20 hover:translate-x-1"
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
            className="flex items-center gap-4 px-5 py-3 rounded-xl text-blue-100 hover:bg-white/20 hover:translate-x-1 transition-all duration-300 w-full"
            >

                <LogOut size={20} />

                <span>Sign Out</span>

            </button>


        </aside>

    );

}


export default Sidebar;
