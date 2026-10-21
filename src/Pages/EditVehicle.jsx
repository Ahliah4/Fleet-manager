import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../Components/Button";
import Loader from "../Components/Loader";
import VehicleForm from "../Components/VehicleForm";
import { initialVehicleForm, normaliseVehicleForm } from "../Components/vehicleFormModel";
import { describeError } from "../lib/errors";
import { applyFleetScope } from "../lib/fleetScope";
import { supabase } from "../lib/supabaseClient";
import { firstError, validateVehicle } from "../lib/vehicleValidation";

function cleanText(value) {
    return String(value ?? "").trim();
}

function EditVehicle() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialVehicleForm);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});

    useEffect(() => {
        async function fetchVehicle() {
            setLoading(true);
            setLoadFailed(false);

            try {
                let query = supabase
                    .from("vehicles")
                    .select("*")
                    .eq("id", id);

                query = await applyFleetScope(query);

                const { data, error: fetchError } = await query.single();

                if (fetchError) {
                    setError(describeError(fetchError, "Vehicle could not be found."));
                    setLoadFailed(true);
                } else {
                    setForm(normaliseVehicleForm(data));
                }
            } catch (loadError) {
                setError(describeError(loadError, "Vehicle could not be found."));
                setLoadFailed(true);
            } finally {
                setLoading(false);
            }
        }

        fetchVehicle();
    }, [id]);

    const handleChange = (event) => {
        const { name, value } = event.target;

        setError(null);
        setForm((current) => ({ ...current, [name]: value }));
        setFieldErrors((current) => {
            if (!current[name]) return current;
            const next = { ...current };
            delete next[name];
            return next;
        });
    };

    const findDuplicate = async (registration) => {
        let query = supabase
            .from("vehicles")
            .select("id,registration_number")
            .neq("id", id);

        query = await applyFleetScope(query);

        const { data, error: duplicateError } = await query;

        if (duplicateError) {
            console.warn("Duplicate check failed:", describeError(duplicateError));
            return false;
        }

        return (data || []).some(
            (vehicle) =>
                cleanText(vehicle.registration_number).toUpperCase() === registration
        );
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (saving) return;

        const validation = validateVehicle(form);

        if (!validation.isValid) {
            setFieldErrors(validation.errors);
            setError(firstError(validation.errors));

            const firstField = Object.keys(validation.errors)[0];
            window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
            return;
        }

        const registration = cleanText(form.registration_number).toUpperCase();

        try {
            if (await findDuplicate(registration)) {
                setFieldErrors({
                    registration_number: `${registration} is already in your fleet.`,
                });
                setError(`${registration} is already in your fleet.`);
                return;
            }
        } catch (duplicateError) {
            setError(describeError(duplicateError, "Failed to check the registration number."));
            return;
        }

        setSaving(true);
        setError(null);
        setFieldErrors({});

        try {
            let updateQuery = supabase
                .from("vehicles")
                .update({
                    registration_number: registration,
                    make: cleanText(form.make),
                    model: cleanText(form.model),
                    year: Number.parseInt(form.year, 10),
                    colour: cleanText(form.colour) || null,
                    insurance_expiry: form.insurance_expiry || null,
                    road_tax_expiry: form.road_tax_expiry || null,
                    roadworthy_expiry: form.roadworthy_expiry || null,
                    next_service_date: form.next_service_date || null,
                    notes: cleanText(form.notes) || null,
                })
                .eq("id", id);

            updateQuery = await applyFleetScope(updateQuery);
            const { error: updateError } = await updateQuery;

            if (updateError) {
                if (updateError.code === "23505") {
                    setFieldErrors({
                        registration_number: "That registration number is already in your fleet.",
                    });
                }
                setError(describeError(updateError, "Failed to update vehicle."));
                return;
            }

            navigate(`/vehicles/${id}`);
        } catch (updateError) {
            setError(describeError(updateError, "Failed to update vehicle."));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <section className="max-w-4xl space-y-6">
                <Loader rows={4} />
            </section>
        );
    }

    if (loadFailed) {
        return (
            <section className="mx-auto max-w-4xl space-y-4">
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error || "Vehicle could not be found."}
                </div>
                <Button to="/vehicles" variant="secondary">
                    Back to Vehicles
                </Button>
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-4xl space-y-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="page-title">
                        Edit Vehicle
                    </h1>
                    <p className="page-description">
                        Update fleet details and document expiry dates.
                    </p>
                </div>

                <Button to={`/vehicles/${id}`} variant="secondary">
                    Back
                </Button>
            </div>

            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            <VehicleForm
                form={form}
                saving={saving}
                errors={fieldErrors}
                submitLabel="Update Vehicle"
                onChange={handleChange}
                onSubmit={handleSubmit}
                onCancel={() => navigate(`/vehicles/${id}`)}
            />
        </section>
    );
}

export default EditVehicle;
