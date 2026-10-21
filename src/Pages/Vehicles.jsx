import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Plus } from "lucide-react";

import Button from "../Components/Button";
import Card from "../Components/Card";
import EmptyState from "../Components/EmptyState";
import Loader from "../Components/Loader";
import SearchInput from "../Components/SearchInput";
import StatusBadge from "../Components/StatusBadge";
import { describeError } from "../lib/errors";
import { applyFleetScope, getCurrentProfile } from "../lib/fleetScope";
import { useRealtimeRefresh } from "../lib/hooks";
import { supabase } from "../lib/supabaseClient";
import { addStatus, formatDate } from "../lib/vehicleHelpers";

const filters = [
    { label: "All", value: "all" },
    { label: "Active", value: "active" },
    { label: "Due Soon", value: "dueSoon" },
    { label: "Expired", value: "expired" },
];

const sortOptions = [
    { label: "Newest", value: "created_at", direction: "desc" },
    { label: "Oldest", value: "created_at", direction: "asc" },
    { label: "Registration", value: "registration_number" },
    { label: "Make", value: "make" },
    { label: "Year", value: "year" },
    { label: "Insurance expiry", value: "insurance_expiry" },
    { label: "Road tax expiry", value: "road_tax_expiry" },
    { label: "Roadworthy expiry", value: "roadworthy_expiry" },
    { label: "Next service", value: "next_service_date" },
];

function Vehicles() {
    const [vehicles, setVehicles] = useState([]);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("all");
    const [sortBy, setSortBy] = useState("created_at");
    const [sortDirection, setSortDirection] = useState("desc");

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

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();
        const withStatus = addStatus(vehicles);

        return withStatus
            .filter((vehicle) => {
                if (filter !== "all" && vehicle.statusType !== filter) return false;
                if (!query) return true;

                return [
                    vehicle.registration_number,
                    vehicle.make,
                    vehicle.model,
                    vehicle.year,
                ].some((value) => String(value || "").toLowerCase().includes(query));
            })
            .sort((a, b) => {
                const aValue = a[sortBy] || "";
                const bValue = b[sortBy] || "";

                if (sortBy === "year") {
                    return sortDirection === "asc"
                        ? Number(aValue) - Number(bValue)
                        : Number(bValue) - Number(aValue);
                }

                return sortDirection === "asc"
                    ? String(aValue).localeCompare(String(bValue))
                    : String(bValue).localeCompare(String(aValue));
            });
    }, [filter, search, sortBy, sortDirection, vehicles]);

    const handleSortChange = (value) => {
        const option = sortOptions.find((item) => item.value === value);
        setSortBy(value);
        if (option?.direction) setSortDirection(option.direction);
    };

    return (
        <section className="space-y-4 sm:space-y-6">
            <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="page-title">Vehicles</h1>
                    <p className="page-description">
                        Manage your fleet vehicles and document compliance.
                    </p>
                </div>

                <Button to="/add-vehicle" className="w-full sm:w-auto">
                    <Plus size={18} />
                    Add Vehicle
                </Button>
            </div>

            <Card className="hover:translate-y-0">
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1fr_auto_auto_auto]">
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Search by registration, make, model, or year..."
                    />

                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        aria-label="Filter vehicles by compliance status"
                        className="app-input min-w-32"
                    >
                        {filters.map((item) => (
                            <option key={item.value} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sortBy}
                        onChange={(event) => handleSortChange(event.target.value)}
                        aria-label="Sort vehicles by"
                        className="app-input min-w-36"
                    >
                        {sortOptions.map((item) => (
                            <option key={item.label} value={item.value}>
                                {item.label}
                            </option>
                        ))}
                    </select>

                    <select
                        value={sortDirection}
                        onChange={(event) => setSortDirection(event.target.value)}
                        aria-label="Sort direction"
                        className="app-input min-w-32"
                    >
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                    </select>
                </div>
            </Card>

            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            {loading ? (
                <Loader rows={5} />
            ) : vehicles.length === 0 ? (
                <EmptyState
                    title="No vehicles yet"
                    message="Add the first vehicle to start tracking fleet documents and reports."
                    action={<Button to="/add-vehicle">Add Vehicle</Button>}
                />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No matching vehicles"
                    message="No vehicles match your search or filters. Try clearing the search."
                    action={
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setSearch("");
                                setFilter("all");
                            }}
                        >
                            Clear filters
                        </Button>
                    }
                />
            ) : (
                <>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Showing {rows.length} of {vehicles.length} vehicles
                    </p>

                    {/* Mobile-first card list */}
                    <div className="space-y-3 md:hidden">
                        {rows.map((vehicle) => (
                            <article
                                key={vehicle.id}
                                className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-950/[0.03]"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-bold text-slate-950">
                                            {vehicle.registration_number}
                                        </p>
                                        <p className="mt-0.5 truncate text-sm text-slate-500">
                                            {vehicle.make} {vehicle.model} · {vehicle.year}
                                        </p>
                                    </div>

                                    <StatusBadge type={vehicle.statusType}>
                                        {vehicle.status.label}
                                    </StatusBadge>
                                </div>

                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                                            Insurance
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-700">
                                            {formatDate(vehicle.insurance_expiry)}
                                        </dd>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                                            Road Tax
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-700">
                                            {formatDate(vehicle.road_tax_expiry)}
                                        </dd>
                                    </div>
                                    <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                                        <dt className="text-[11px] uppercase tracking-wide text-slate-400">
                                            Next service
                                        </dt>
                                        <dd className="mt-1 font-medium text-slate-700">
                                            {formatDate(vehicle.next_service_date)}
                                        </dd>
                                    </div>
                                </dl>

                                <Button
                                    to={`/vehicles/${vehicle.id}`}
                                    variant="secondary"
                                    className="mt-3 w-full"
                                >
                                    <Eye size={16} />
                                    View details
                                </Button>
                            </article>
                        ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-950/[0.03] md:block">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-left text-sm text-slate-700">
                                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                    <tr>
                                        <th className="p-4">Registration</th>
                                        <th className="p-4">Make</th>
                                        <th className="p-4">Model</th>
                                        <th className="p-4">Year</th>
                                        <th className="p-4">Insurance</th>
                                        <th className="p-4">Road Tax</th>
                                        <th className="p-4">Service</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((vehicle) => (
                                        <tr
                                            key={vehicle.id}
                                            className="border-t border-slate-100 transition hover:bg-blue-50/40"
                                        >
                                            <td className="p-4 font-semibold text-slate-900">{vehicle.registration_number}</td>
                                            <td className="p-4">{vehicle.make}</td>
                                            <td className="p-4">{vehicle.model}</td>
                                            <td className="p-4">{vehicle.year}</td>
                                            <td className="p-4">{formatDate(vehicle.insurance_expiry)}</td>
                                            <td className="p-4">{formatDate(vehicle.road_tax_expiry)}</td>
                                            <td className="p-4">{formatDate(vehicle.next_service_date)}</td>
                                            <td className="p-4">
                                                <StatusBadge type={vehicle.statusType}>
                                                    {vehicle.status.label}
                                                </StatusBadge>
                                            </td>
                                            <td className="p-4">
                                                <Button
                                                    to={`/vehicles/${vehicle.id}`}
                                                    variant="secondary"
                                                    className="w-full px-3 py-2 sm:w-auto"
                                                >
                                                    <Eye size={16} />
                                                    View
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
}

export default Vehicles;
