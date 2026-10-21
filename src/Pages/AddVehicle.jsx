import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../Components/Button";
import VehicleForm from "../Components/VehicleForm";
import { initialVehicleForm } from "../Components/vehicleFormModel";
import { describeError } from "../lib/errors";
import { applyFleetScope, ownerFields } from "../lib/fleetScope";
import { notifyVehicleAdded } from "../lib/notificationService";
import { supabase } from "../lib/supabaseClient";
import { firstError, validateVehicle } from "../lib/vehicleValidation";

function cleanText(value) {
  return String(value ?? "").trim();
}

export default function AddVehicle() {
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState(initialVehicleForm);
  const stayOnPage = useRef(false);

  const handleChange = (event) => {
    const { name, value } = event.target;

    setSuccess(null);
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
      .select("id,registration_number");

    query = await applyFleetScope(query);

    const { data, error: duplicateError } = await query;

    if (duplicateError) {
      // A read failure should not block the save; the database uniqueness
      // index is the real backstop.
      console.warn("Duplicate check failed:", describeError(duplicateError));
      return false;
    }

    return (data || []).some(
      (vehicle) =>
        cleanText(vehicle.registration_number).toUpperCase() === registration
    );
  };

  const saveVehicle = async (values) => {
    const registration = cleanText(values.registration_number).toUpperCase();

    if (await findDuplicate(registration)) {
      const duplicate = new Error(`${registration} is already in your fleet.`);
      duplicate.field = "registration_number";
      throw duplicate;
    }

    const payload = {
      registration_number: registration,
      make: cleanText(values.make),
      model: cleanText(values.model),
      year: Number.parseInt(values.year, 10),
      colour: cleanText(values.colour) || null,
      insurance_expiry: values.insurance_expiry || null,
      road_tax_expiry: values.road_tax_expiry || null,
      roadworthy_expiry: values.roadworthy_expiry || null,
      next_service_date: values.next_service_date || null,
      notes: cleanText(values.notes) || null,
      ...(await ownerFields()),
    };

    const { data: vehicle, error: insertError } = await supabase
      .from("vehicles")
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const duplicate = new Error(`${registration} is already in your fleet.`);
        duplicate.field = "registration_number";
        throw duplicate;
      }
      throw new Error(describeError(insertError, "Failed to save vehicle."));
    }

    // Notifications are best-effort and must never make a saved vehicle look
    // like a failed save.
    await notifyVehicleAdded(vehicle);

    return vehicle;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (saving) return;

    const validation = validateVehicle(form);

    if (!validation.isValid) {
      stayOnPage.current = false;
      setFieldErrors(validation.errors);
      setError(firstError(validation.errors));
      setSuccess(null);

      const firstField = Object.keys(validation.errors)[0];
      window.setTimeout(() => document.getElementById(firstField)?.focus(), 0);
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});
    setSuccess(null);

    try {
      const vehicle = await saveVehicle(form);
      const addAnother = stayOnPage.current;
      stayOnPage.current = false;

      if (addAnother) {
        setForm(initialVehicleForm);
        setSuccess(
          `${vehicle.registration_number} saved. You can add the next vehicle now.`
        );
      } else {
        navigate(`/vehicles/${vehicle.id}`, { replace: true });
      }
    } catch (saveError) {
      stayOnPage.current = false;

      if (saveError.field) {
        setFieldErrors({ [saveError.field]: saveError.message });
      }
      setError(describeError(saveError, "Failed to save vehicle."));
    } finally {
      setSaving(false);
    }
  };

  const handleAddAnother = (event) => {
    if (saving) return;

    stayOnPage.current = true;
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Add Vehicle</h1>
          <p className="page-description">
            Register a fleet vehicle and its document expiry dates.
          </p>
        </div>

        <Button to="/vehicles" variant="secondary">
          Back
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"
        >
          {success}
        </div>
      )}

      <VehicleForm
        form={form}
        saving={saving}
        errors={fieldErrors}
        submitLabel="Save Vehicle"
        onChange={handleChange}
        onSubmit={handleSubmit}
        onSubmitAndNew={handleAddAnother}
        onCancel={() => navigate("/vehicles")}
      />
    </section>
  );
}
