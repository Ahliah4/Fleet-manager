import { useEffect, useMemo, useState } from "react";
import { Download, FileDown } from "lucide-react";
import {
    Bar,
    BarChart,
    Cell,
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
import StatusBadge from "../Components/StatusBadge";
import { supabase } from "../lib/supabaseClient";
import { addStatus, formatDate, getMonthlyRegistrations } from "../lib/vehicleHelpers";

const chartColors = ["#16a34a", "#f59e0b", "#dc2626"];

function exportToCSV(vehicles) {
    const headers = ["Registration", "Make", "Model", "Year", "Colour", "Insurance Expiry", "Road Tax Expiry", "Roadworthy Expiry", "Status"];

    const rows = vehicles.map((vehicle) => [
        vehicle.registration_number,
        vehicle.make,
        vehicle.model,
        vehicle.year,
        vehicle.colour || "",
        vehicle.insurance_expiry || "",
        vehicle.road_tax_expiry || "",
        vehicle.roadworthy_expiry || "",
        vehicle.status.label,
    ]);

    const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fleet-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function Reports() {
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchVehicles() {
            const { data, error: fetchError } = await supabase
                .from("vehicles")
                .select("*")
                .order("created_at", { ascending: false });

            if (fetchError) {
                setError("Failed to load report data.");
            } else {
                setVehicles(data || []);
            }

            setLoading(false);
        }

        fetchVehicles();
    }, []);

    const withStatus = useMemo(() => addStatus(vehicles), [vehicles]);
    const active = withStatus.filter((vehicle) => vehicle.statusType === "active");
    const dueSoon = withStatus.filter((vehicle) => vehicle.statusType === "dueSoon");
    const expired = withStatus.filter((vehicle) => vehicle.statusType === "expired");
    const newest = [...withStatus].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 5);
    const oldest = [...withStatus].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))).slice(0, 5);

    const complianceData = [
        { name: "Active", value: active.length },
        { name: "Due Soon", value: dueSoon.length },
        { name: "Expired", value: expired.length },
    ];
    const monthlyData = getMonthlyRegistrations(vehicles);

    const cards = [
        { label: "Total", value: vehicles.length, type: "unread" },
        { label: "Active", value: active.length, type: "active" },
        { label: "Due Soon", value: dueSoon.length, type: "dueSoon" },
        { label: "Expired", value: expired.length, type: "expired" },
    ];

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="text-4xl font-bold text-slate-900">
                        Reports
                    </h1>
                    <p className="mt-2 text-gray-500">
                        Compliance statistics and fleet document exports.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button onClick={() => exportToCSV(withStatus)} disabled={vehicles.length === 0}>
                        <Download size={18} />
                        Export CSV
                    </Button>
                    <Button variant="secondary" onClick={() => window.print()} disabled={vehicles.length === 0}>
                        <FileDown size={18} />
                        Export PDF
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            {loading ? (
                <Loader rows={5} />
            ) : vehicles.length === 0 ? (
                <EmptyState
                    title="No report data"
                    message="Add vehicles to generate compliance statistics and exports."
                    action={<Button to="/add-vehicle">Add Vehicle</Button>}
                />
            ) : (
                <>
                    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                        {cards.map((card) => (
                            <Card key={card.label}>
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-slate-500">{card.label}</p>
                                    <StatusBadge type={card.type}>Fleet</StatusBadge>
                                </div>
                                <p className="mt-4 text-4xl font-bold text-slate-900">{card.value}</p>
                            </Card>
                        ))}
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <Card>
                            <h2 className="text-xl font-bold text-slate-900">
                                Compliance Breakdown
                            </h2>
                            <div className="mt-5 h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={complianceData} dataKey="value" nameKey="name" outerRadius={95}>
                                            {complianceData.map((item, index) => (
                                                <Cell key={item.name} fill={chartColors[index]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>

                        <Card>
                            <h2 className="text-xl font-bold text-slate-900">
                                Monthly Registrations
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

                    <div className="grid gap-6 xl:grid-cols-2">
                        {[
                            ["Newest Vehicles", newest],
                            ["Oldest Vehicles", oldest],
                        ].map(([title, list]) => (
                            <Card key={title} className="p-0">
                                <div className="border-b border-gray-100 p-6">
                                    <h2 className="text-xl font-bold text-slate-900">{title}</h2>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {list.map((vehicle) => (
                                        <div key={`${title}-${vehicle.id}`} className="flex items-center justify-between gap-4 p-4 transition hover:bg-slate-50">
                                            <div>
                                                <p className="font-semibold text-slate-900">{vehicle.registration_number}</p>
                                                <p className="text-sm text-slate-500">{vehicle.make} {vehicle.model} · {formatDate(vehicle.created_at)}</p>
                                            </div>
                                            <StatusBadge type={vehicle.statusType}>
                                                {vehicle.status.label}
                                            </StatusBadge>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                </>
            )}
        </section>
    );
}

export default Reports;
