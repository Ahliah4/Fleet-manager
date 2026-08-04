import { useEffect, useState } from "react";
import { Car, Clock, AlertTriangle, ShieldCheck } from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { getStatus } from "../lib/vehicleStatus";

import StatCard from "../Components/statCard";

function Dashboard() {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchVehicles = async () => {
            const { data, error } = await supabase
                .from("vehicles")
                .select("*");

            if (error) {
                console.error("Error fetching vehicles:", error.message);
            } else {
                setVehicles(data);
            }

            setLoading(false);
        };

        fetchVehicles();
    }, []);

    const total = vehicles.length;

    const dueSoon = vehicles.filter(
        (v) => getStatus(v).color === "bg-yellow-600"
    ).length;

    const expired = vehicles.filter(
        (v) => getStatus(v).label.includes("Expired")
    ).length;

    const active = vehicles.filter(
        (v) => getStatus(v).label === "Active"
    ).length;

    const stats = [
        {
            title: "Total Vehicles",
            value: total,
            description: "All registered vehicles",
            icon: Car,
            iconBg: "bg-blue-600",
            sparkColor: "#2563eb",
        },
        {
            title: "Due Soon",
            value: dueSoon,
            description: "Documents expiring soon",
            icon: Clock,
            iconBg: "bg-amber-500",
            sparkColor: "#f59e0b",
        },
        {
            title: "Expired",
            value: expired,
            description: "Documents already expired",
            icon: AlertTriangle,
            iconBg: "bg-red-500",
            sparkColor: "#ef4444",
        },
        {
            title: "Active",
            value: active,
            description: "All documents up to date",
            icon: ShieldCheck,
            iconBg: "bg-emerald-500",
            sparkColor: "#10b981",
        },
    ];

    return (
        <section className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-900">
                    Welcome back 👋
                </h1>

                <p className="mt-1 text-gray-500">
                    Here's what's happening with your fleet today.
                </p>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {loading ? (
                    <p className="col-span-4 text-center text-gray-500">
                        Loading dashboard...
                    </p>
                ) : (
                    stats.map((stat) => (
                        <StatCard
                            key={stat.title}
                            {...stat}
                        />
                    ))
                )}
            </div>

            {/* Recent Vehicles */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Recent Vehicles
                    </h2>
                </div>

                {vehicles.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No vehicles found.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {vehicles.slice(0, 5).map((vehicle) => {
                            const status = getStatus(vehicle);

                            return (
                                <div
                                    key={vehicle.id}
                                    className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition"
                                >
                                    <div>
                                        <h3 className="font-semibold text-gray-900">
                                            {vehicle.registration_number}
                                        </h3>

                                        <p className="text-sm text-gray-500">
                                            {vehicle.make} {vehicle.model}
                                        </p>
                                    </div>

                                    <span
                                        className={`${status.color} text-white text-xs font-medium px-3 py-1 rounded-full`}
                                    >
                                        {status.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

export default Dashboard;