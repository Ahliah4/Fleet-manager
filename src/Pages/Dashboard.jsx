import { useEffect, useMemo, useState } from "react";
import { BarChart3, Car, Clock, FileText, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import {
    Bar,
    BarChart,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";

import Button from "../Components/Button";
import Card from "../Components/Card";
import EmptyState from "../Components/EmptyState";
import Loader from "../Components/Loader";
import StatCard from "../Components/statCard";
import StatusBadge from "../Components/StatusBadge";
import { supabase } from "../lib/supabaseClient";
import { addStatus, formatDate, getMonthlyRegistrations } from "../lib/vehicleHelpers";

const chartColors = {
    Active: "#16a34a",
    "Due Soon": "#f59e0b",
    Expired: "#dc2626",
};

function Dashboard() {
    const [vehicles, setVehicles] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchDashboard() {
            const [vehicleResult, notificationResult] = await Promise.all([
                supabase
                    .from("vehicles")
                    .select("*")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("notifications")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(5),
            ]);

            if (vehicleResult.error) {
                setError("Failed to load dashboard vehicles.");
            } else {
                setVehicles(vehicleResult.data || []);
            }

            if (!notificationResult.error) {
                setNotifications(notificationResult.data || []);
            }

            setLoading(false);
        }

        fetchDashboard();
    }, []);

    const vehiclesWithStatus = useMemo(() => addStatus(vehicles), [vehicles]);
    const active = vehiclesWithStatus.filter((vehicle) => vehicle.statusType === "active").length;
    const dueSoon = vehiclesWithStatus.filter((vehicle) => vehicle.statusType === "dueSoon").length;
    const expired = vehiclesWithStatus.filter((vehicle) => vehicle.statusType === "expired").length;
    const monthlyData = useMemo(() => getMonthlyRegistrations(vehicles), [vehicles]);

    const stats = [
        {
            title: "Total Vehicles",
            value: vehicles.length,
            description: "All registered vehicles",
            icon: Car,
            iconBg: "bg-blue-600",
        },
        {
            title: "Due Soon",
            value: dueSoon,
            description: "Documents expiring soon",
            icon: Clock,
            iconBg: "bg-amber-500",
        },
        {
            title: "Expired",
            value: expired,
            description: "Documents already expired",
            icon: TriangleAlert,
            iconBg: "bg-red-500",
        },
        {
            title: "Active",
            value: active,
            description: "All documents up to date",
            icon: ShieldCheck,
            iconBg: "bg-emerald-500",
        },
    ];

    const pieData = [
        { name: "Active", value: active },
        { name: "Due Soon", value: dueSoon },
        { name: "Expired", value: expired },
    ].filter((item) => item.value > 0);

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="page-title">
                        Dashboard
                    </h1>
                    <p className="page-description">
                        Fleet document status and recent activity at a glance.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button to="/add-vehicle">
                        <Plus size={18} />
                        Add Vehicle
                    </Button>
                    <Button to="/vehicles" variant="secondary">
                        <Car size={18} />
                        View Vehicles
                    </Button>
                    <Button to="/reports" variant="secondary">
                        <FileText size={18} />
                        Reports
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            {loading ? (
                <Loader rows={4} />
            ) : vehicles.length === 0 ? (
                <EmptyState
                    title="No vehicles yet"
                    message="Your dashboard will show compliance charts, recent vehicles, and alerts once vehicles are added."
                    action={<Button to="/add-vehicle">Add Vehicle</Button>}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {stats.map((stat) => (
                            <StatCard key={stat.title} {...stat} />
                        ))}
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                        <Card className="overflow-hidden">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-slate-950">
                                    Fleet Status
                                </h2>
                                <BarChart3 className="text-blue-600" size={22} />
                            </div>

                            <div className="mt-5 h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95}>
                                            {pieData.map((entry) => (
                                                <Cell key={entry.name} fill={chartColors[entry.name]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card>
                            <h2 className="text-lg font-semibold text-slate-950">
                                Monthly Vehicle Registrations
                            </h2>
                            <div className="mt-5 h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={monthlyData}>
                                        <XAxis dataKey="month" stroke="#94a3b8" />
                                        <YAxis allowDecimals={false} stroke="#94a3b8" />
                                        <Tooltip />
                                        <Bar dataKey="vehicles" fill="#2563eb" radius={[8, 8, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                        <Card className="overflow-hidden p-0">
                            <div className="border-b border-gray-100 p-6">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Recent Vehicles
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                        <tr>
                                            <th className="p-4">Registration</th>
                                            <th className="p-4">Vehicle</th>
                                            <th className="p-4">Created</th>
                                            <th className="p-4">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {vehiclesWithStatus.slice(0, 5).map((vehicle) => (
                                            <tr key={vehicle.id} className="border-t border-gray-100 transition hover:bg-slate-50">
                                                <td className="p-4 font-semibold text-slate-900">{vehicle.registration_number}</td>
                                                <td className="p-4 text-slate-600">{vehicle.make} {vehicle.model}</td>
                                                <td className="p-4 text-slate-500">{formatDate(vehicle.created_at)}</td>
                                                <td className="p-4">
                                                    <StatusBadge type={vehicle.statusType}>
                                                        {vehicle.status.label}
                                                    </StatusBadge>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>

                        <Card>
                            <div className="flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-900">
                                    Recent Notifications
                                </h2>
                                <Button to="/notifications" variant="secondary" className="px-3 py-2 text-sm">
                                    View all
                                </Button>
                            </div>

                            <div className="mt-5 space-y-3">
                                {notifications.length === 0 ? (
                                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                                        No recent notifications.
                                    </p>
                                ) : (
                                    notifications.map((notification) => (
                                        <div key={notification.id} className="rounded-xl border border-gray-100 p-4 transition hover:border-blue-500 hover:shadow-lg">
                                            <p className="font-semibold text-slate-900">{notification.title}</p>
                                            <p className="mt-1 line-clamp-2 text-sm text-slate-500">{notification.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>

                    <Card>
                        <h2 className="text-xl font-bold text-slate-900">
                            Compliance Trend
                        </h2>
                        <div className="mt-5 h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={monthlyData}>
                                    <XAxis dataKey="month" stroke="#94a3b8" />
                                    <YAxis allowDecimals={false} stroke="#94a3b8" />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="vehicles" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </>
            )}
        </section>
    );
}

export default Dashboard;
