import { Outlet } from "react-router-dom";

import Navbar from "../Components/navbar";
import Sidebar from "../Components/sidebar";


function DashboardLayout(){

return (

<div className="min-h-screen bg-slate-100 text-slate-900 flex">

    {/* Sidebar */}
    <Sidebar />


    {/* Main Area */}
    <div className="flex-1 flex flex-col">


        <Navbar />


        <main className="p-8">

            <Outlet />

        </main>


    </div>


</div>

);

}


export default DashboardLayout;
