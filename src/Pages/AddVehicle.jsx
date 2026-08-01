import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../Components/Button";
import VehicleForm, { initialVehicleForm } from "../Components/VehicleForm";
import { supabase } from "../lib/supabaseClient";

export default function AddVehicle() {
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(initialVehicleForm);

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .insert([
        {
          registration_number: form.registration_number,
          make: form.make,
          model: form.model,
          year: parseInt(form.year, 10),
          colour: form.colour || null,
          insurance_expiry: form.insurance_expiry || null,
          road_tax_expiry: form.road_tax_expiry || null,
          roadworthy_expiry: form.roadworthy_expiry || null,
          notes: form.notes || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);
      setError("Failed to save vehicle.");
      setSaving(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    await supabase.from("notifications").insert([
      {
        user_id: user?.id,
        vehicle_id: vehicle.id,
        title: "New Vehicle Added",
        message: `${vehicle.make} ${vehicle.model} (${vehicle.registration_number}) was added to the fleet.`,
        type: "success",
        is_read: false,
      },
    ]);

    setSaving(false);
    navigate("/vehicles");
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Add Vehicle</h1>
          <p className="mt-2 text-gray-500">
            Register a fleet vehicle and its document expiry dates.
          </p>
        </div>

        <Button to="/vehicles" variant="secondary">
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
        submitLabel="Save Vehicle"
        onChange={handleChange}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/vehicles")}
      />
    </section>
  );
}
