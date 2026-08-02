import { useEffect, useState } from "react";
import { ArrowLeft, Edit, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../Components/Button";
import Card from "../Components/Card";
import ConfirmDialog from "../Components/ConfirmDialog";
import Loader from "../Components/Loader";
import StatusBadge from "../Components/StatusBadge";
import { supabase } from "../lib/supabaseClient";
import { formatDate, getDocumentRows, getVehicleStatusType } from "../lib/vehicleHelpers";
import { getStatus } from "../lib/vehicleStatus";

function documentBadgeLabel(row) {
    if (row.state === "missing") return "Not set";
    if (row.state === "expired") return "Expired";
    if (row.state === "dueSoon") return `${row.days} days left`;
    return "Valid";
}

function VehicleDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [vehicle, setVehicle] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchVehicle() {
            const { data, error: fetchError } = await supabase
                .from("vehicles")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError) {
                setError("Vehicle could not be found.");
            } else {
                setVehicle(data);
            }

            setLoading(false);
        }

        fetchVehicle();
    }, [id]);

    const handleDelete = async () => {
        setDeleting(true);

        const { error: deleteError } = await supabase
            .from("vehicles")
            .delete()
            .eq("id", id);

        setDeleting(false);

        if (deleteError) {
            setError("Failed to delete vehicle.");
            setConfirmOpen(false);
            return;
        }

        navigate("/vehicles");
    };

    if (loading) {
        return (
            <section className="space-y-6">
                <Loader rows={5} />
            </section>
        );
    }

    if (!vehicle) {
        return (
            <section className="space-y-4">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error || "Vehicle not found."}
                </div>
                <Button to="/vehicles" variant="secondary">
                    Back to Vehicles
                </Button>
            </section>
        );
    }

    const status = getStatus(vehicle);
    const statusType = getVehicleStatusType(vehicle);
    const documents = getDocumentRows(vehicle);

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <Button to="/vehicles" variant="secondary" className="mb-4 px-4 py-2">
                        <ArrowLeft size={16} />
                        Back
                    </Button>

                    <h1 className="page-title">
                        {vehicle.registration_number}
                    </h1>
                    <p className="mt-2 text-gray-500">
                        {vehicle.make} {vehicle.model} · {vehicle.year}
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button to={`/vehicles/${id}/edit`} variant="secondary">
                        <Edit size={18} />
                        Edit
                    </Button>
                    <Button variant="danger" onClick={() => setConfirmOpen(true)}>
                        <Trash2 size={18} />
                        Delete
                    </Button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <Card>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">
                                Vehicle Information
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Core registration and fleet details.
                            </p>
                        </div>

                        <StatusBadge type={statusType}>
                            {status.label}
                        </StatusBadge>
                    </div>

                    <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                        {[
                            ["Registration", vehicle.registration_number],
                            ["Make", vehicle.make],
                            ["Model", vehicle.model],
                            ["Year", vehicle.year],
                            ["Colour", vehicle.colour || "Not set"],
                            ["Created", formatDate(vehicle.created_at)],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                                <dt className="text-xs uppercase text-slate-400">{label}</dt>
                                <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
                            </div>
                        ))}
                    </dl>
                </Card>

                <Card>
                    <h2 className="text-xl font-bold text-slate-900">
                        Document Status
                    </h2>
                    <div className="mt-5 space-y-3">
                        {documents.map((document) => (
                            <div
                                key={document.name}
                                className="flex items-center justify-between rounded-xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50/40"
                            >
                                <div>
                                    <p className="font-semibold text-slate-900">{document.name}</p>
                                    <p className="text-sm text-slate-500">{formatDate(document.value)}</p>
                                </div>
                                <StatusBadge type={document.state}>
                                    {documentBadgeLabel(document)}
                                </StatusBadge>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <Card>
                <h2 className="text-xl font-bold text-slate-900">
                    History
                </h2>
                <div className="mt-5 space-y-4">
                    <div className="flex gap-4">
                        <div className="mt-1 h-3 w-3 rounded-full bg-blue-600" />
                        <div>
                            <p className="font-semibold text-slate-900">Vehicle record created</p>
                            <p className="text-sm text-slate-500">{formatDate(vehicle.created_at)}</p>
                        </div>
                    </div>
                    <div className="flex gap-4">
                        <div className="mt-1 h-3 w-3 rounded-full bg-slate-300" />
                        <div>
                            <p className="font-semibold text-slate-900">Current compliance status</p>
                            <p className="text-sm text-slate-500">{status.label}</p>
                        </div>
                    </div>
                </div>
            </Card>

            {vehicle.notes && (
                <Card>
                    <h2 className="text-xl font-bold text-slate-900">Notes</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{vehicle.notes}</p>
                </Card>
            )}

            <ConfirmDialog
                open={confirmOpen}
                title="Delete vehicle?"
                message={`This will permanently remove ${vehicle.registration_number} from the fleet.`}
                confirmLabel="Delete Vehicle"
                loading={deleting}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={handleDelete}
            />
        </section>
    );
}

export default VehicleDetail;
