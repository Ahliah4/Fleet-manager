import { Outlet } from "react-router-dom";
import { useState } from "react";

import Navbar from "../Components/navbar";
import Sidebar from "../Components/sidebar";


function DashboardLayout(){
const [sidebarOpen, setSidebarOpen] = useState(false);

return (

<div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">

    {/* Sidebar */}
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />


    {/* Main Area */}
    <div className="min-w-0 flex-1 flex flex-col">


        <Navbar onMenuClick={() => setSidebarOpen(true)} />


        <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">

            <Outlet />

        </main>


    </div>


</div>

);

}


export default DashboardLayout;
