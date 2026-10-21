import { useCallback, useEffect, useState } from "react";
import { Car, Clock, AlertTriangle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import Card from "../Components/Card";
import { useAuth } from "../lib/authContext";
import { describeError } from "../lib/errors";
import { applyFleetScope, getCurrentProfile } from "../lib/fleetScope";
import { useRealtimeRefresh } from "../lib/hooks";
import { supabase } from "../lib/supabaseClient";
import { formatDate, getDocumentRows } from "../lib/vehicleHelpers";
import { getStatus } from "../lib/vehicleStatus";

import StatCard from "../Components/statCard";

function Dashboard() {
    const { user } = useAuth();
    const [vehicles, setVehicles] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadVehicles = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);

        try {
            const current = await getCurrentProfile();
            setProfile(current);

            let query = supabase.from("vehicles").select("*");
            query = await applyFleetScope(query);

            const { data, error: fetchError } = await query.order("created_at", {
                ascending: false,
            });

            if (fetchError) {
                setError(describeError(fetchError, "Failed to load vehicles."));
            } else {
                setVehicles(data || []);
                setError(null);
            }
        } catch (loadError) {
            setError(describeError(loadError, "Failed to load vehicles."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadVehicles();
    }, [loadVehicles]);

    useRealtimeRefresh("vehicles", profile?.fleet_id, () => loadVehicles({ silent: true }));

    const total = vehicles.length;

    const dueSoon = vehicles.filter(
        (vehicle) => getStatus(vehicle).color === "bg-yellow-600"
    ).length;

    const expired = vehicles.filter(
        (vehicle) => getStatus(vehicle).label.includes("Expired")
    ).length;

    const active = vehicles.filter(
        (vehicle) => getStatus(vehicle).label === "Active"
    ).length;

    const health = total ? Math.round((active / total) * 100) : 0;
    const firstName = (user?.user_metadata?.full_name || user?.email || "")
        .split(/[\s@]/)[0] || "there";

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
            description: "Documents expiring within 30 days",
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

    const attention = vehicles
        .flatMap((vehicle) =>
            getDocumentRows(vehicle)
                .filter((document) => document.state === "expired" || document.state === "dueSoon")
                .map((document) => ({ vehicle, document }))
        )
        .sort((a, b) => (a.document.days ?? 0) - (b.document.days ?? 0))
        .slice(0, 4);

    return (
        <section className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                    Welcome back, {firstName} 👋
                </h1>

                <p className="mt-1 text-gray-500">
                    Here's what's happening with your fleet today.
                </p>
            </div>

            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {loading ? (
                    <p className="col-span-2 text-center text-gray-500 lg:col-span-4">
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

            {!loading && total > 0 && (
                <Card className="hover:translate-y-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-base font-semibold text-slate-950">
                                Fleet health
                            </h2>
                            <p className="mt-0.5 text-sm text-slate-500">
                                {active} of {total} vehicles have no document due within 30 days.
                            </p>
                        </div>
                        <p className="text-2xl font-bold text-slate-950">{health}%</p>
                    </div>
                    <div
                        className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100"
                        role="progressbar"
                        aria-valuenow={health}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Fleet compliance health"
                    >
                        <div
                            className={`h-full rounded-full transition-all duration-500 ${
                                health >= 80
                                    ? "bg-emerald-500"
                                    : health >= 50
                                        ? "bg-amber-500"
                                        : "bg-red-500"
                            }`}
                            style={{ width: `${health}%` }}
                        />
                    </div>
                </Card>
            )}

            {attention.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
                    <h2 className="text-base font-semibold text-amber-900">
                        Needs attention
                    </h2>
                    <ul className="mt-3 space-y-2">
                        {attention.map(({ vehicle, document }) => (
                            <li key={`${vehicle.id}-${document.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm shadow-sm">
                                <Link to={`/vehicles/${vehicle.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                                    {vehicle.registration_number} · {document.name}
                                </Link>
                                <span className={document.state === "expired" ? "font-semibold text-red-600" : "font-semibold text-amber-600"}>
                                    {document.state === "expired"
                                        ? `Expired ${formatDate(document.value)}`
                                        : `${document.days} day${document.days === 1 ? "" : "s"} left`}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 sm:px-6">
                    <h2 className="text-lg font-semibold text-gray-900">
                        Recent Vehicles
                    </h2>
                    <Link to="/vehicles" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                        View all
                    </Link>
                </div>

                {vehicles.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No vehicles found. Add your first vehicle to get started.
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {vehicles.slice(0, 5).map((vehicle) => {
                            const status = getStatus(vehicle);

                            return (
                                <Link
                                    key={vehicle.id}
                                    to={`/vehicles/${vehicle.id}`}
                                    className="flex items-center justify-between gap-3 px-4 py-4 transition hover:bg-gray-50 sm:px-6"
                                >
                                    <div className="min-w-0">
                                        <h3 className="truncate font-semibold text-gray-900">
                                            {vehicle.registration_number}
                                        </h3>

                                        <p className="truncate text-sm text-gray-500">
                                            {vehicle.make} {vehicle.model}
                                        </p>
                                    </div>

                                    <span
                                        className={`${status.color} shrink-0 rounded-full px-3 py-1 text-xs font-medium text-white`}
                                    >
                                        {status.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </section>
    );
}

export default Dashboard;
