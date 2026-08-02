import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Button from "../Components/Button";
import Loader from "../Components/Loader";
import VehicleForm, { initialVehicleForm, normaliseVehicleForm } from "../Components/VehicleForm";
import { supabase } from "../lib/supabaseClient";

function EditVehicle() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState(initialVehicleForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchVehicle() {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from("vehicles")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError) {
                setError("Vehicle could not be found.");
            } else {
                setForm(normaliseVehicleForm(data));
            }

            setLoading(false);
        }

        fetchVehicle();
    }, [id]);

    const handleChange = (event) => {
        setForm((current) => ({
            ...current,
            [event.target.name]: event.target.value,
        }));
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);

        const { error: updateError } = await supabase
            .from("vehicles")
            .update({
                ...form,
                year: parseInt(form.year, 10),
                colour: form.colour || null,
                insurance_expiry: form.insurance_expiry || null,
                road_tax_expiry: form.road_tax_expiry || null,
                roadworthy_expiry: form.roadworthy_expiry || null,
                notes: form.notes || null,
            })
            .eq("id", id);

        setSaving(false);

        if (updateError) {
            setError("Failed to update vehicle.");
            return;
        }

        navigate(`/vehicles/${id}`);
    };

    if (loading) {
        return (
            <section className="max-w-4xl space-y-6">
                <Loader rows={4} />
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
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            <VehicleForm
                form={form}
                saving={saving}
                submitLabel="Update Vehicle"
                onChange={handleChange}
                onSubmit={handleSubmit}
                onCancel={() => navigate(`/vehicles/${id}`)}
            />
        </section>
    );
}

export default EditVehicle;
