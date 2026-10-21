import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { WifiOff } from "lucide-react";

import InstallPrompt from "../Components/InstallPrompt";
import MobileNav from "../Components/MobileNav";
import Navbar from "../Components/navbar";
import Sidebar from "../Components/sidebar";
import { useOnlineStatus } from "../lib/hooks";
import { checkVehicleAlerts } from "../lib/notificationService";

function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const online = useOnlineStatus();

    useEffect(() => {
        let lastRun = 0;

        const runAlertScan = () => {
            const now = Date.now();
            if (now - lastRun < 5 * 60 * 1000) return;
            lastRun = now;

            checkVehicleAlerts().catch((error) => {
                console.warn("Alert scan skipped:", error?.message);
            });
        };

        // Refresh alerts on load and when the user returns to the tab. The
        // scheduled database job covers the "app closed" case.
        runAlertScan();

        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") runAlertScan();
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
            >
                Skip to content
            </a>

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="flex min-w-0 flex-1 flex-col">
                <Navbar onMenuClick={() => setSidebarOpen(true)} />

                {!online && (
                    <div
                        role="status"
                        className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800"
                    >
                        <WifiOff size={14} />
                        You are offline. Saved changes will fail until the connection returns.
                    </div>
                )}

                <main
                    id="main-content"
                    className="mx-auto w-full max-w-[1600px] p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8"
                >
                    <Outlet />
                </main>
            </div>

            <MobileNav onMenuClick={() => setSidebarOpen(true)} />
            <InstallPrompt />
        </div>
    );
}

export default DashboardLayout;
