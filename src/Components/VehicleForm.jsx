import Button from "./Button";
import Card from "./Card";

const initialVehicleForm = {
    registration_number: "",
    make: "",
    model: "",
    year: "",
    colour: "",
    insurance_expiry: "",
    road_tax_expiry: "",
    roadworthy_expiry: "",
    notes: "",
};

function normaliseVehicleForm(vehicle = {}) {
    return {
        registration_number: vehicle.registration_number || "",
        make: vehicle.make || "",
        model: vehicle.model || "",
        year: vehicle.year || "",
        colour: vehicle.colour || "",
        insurance_expiry: vehicle.insurance_expiry || "",
        road_tax_expiry: vehicle.road_tax_expiry || "",
        roadworthy_expiry: vehicle.roadworthy_expiry || "",
        notes: vehicle.notes || "",
    };
}

function VehicleForm({
    form,
    saving,
    submitLabel,
    onChange,
    onSubmit,
    onCancel,
}) {
    const inputClass = "w-full rounded-xl border border-gray-100 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:ring-2 focus:ring-blue-500";
    const labelClass = "mb-1 block text-sm font-medium text-slate-600";

    return (
        <form onSubmit={onSubmit} className="space-y-6">
            <Card>
                <h2 className="text-lg font-semibold text-slate-900">
                    Vehicle Information
                </h2>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label>
                        <span className={labelClass}>Registration Number</span>
                        <input
                            name="registration_number"
                            value={form.registration_number}
                            onChange={onChange}
                            className={inputClass}
                            required
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Make</span>
                        <input
                            name="make"
                            value={form.make}
                            onChange={onChange}
                            className={inputClass}
                            required
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Model</span>
                        <input
                            name="model"
                            value={form.model}
                            onChange={onChange}
                            className={inputClass}
                            required
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Year</span>
                        <input
                            name="year"
                            type="number"
                            min="1900"
                            max="2100"
                            value={form.year}
                            onChange={onChange}
                            className={inputClass}
                            required
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Colour</span>
                        <input
                            name="colour"
                            value={form.colour}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </label>

                    <label className="sm:col-span-2">
                        <span className={labelClass}>Notes</span>
                        <textarea
                            name="notes"
                            value={form.notes}
                            onChange={onChange}
                            className={inputClass}
                            rows={4}
                        />
                    </label>
                </div>
            </Card>

            <Card>
                <h2 className="text-lg font-semibold text-slate-900">
                    Document Expiry Dates
                </h2>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label>
                        <span className={labelClass}>Insurance Expiry</span>
                        <input
                            name="insurance_expiry"
                            type="date"
                            value={form.insurance_expiry}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Road Tax Expiry</span>
                        <input
                            name="road_tax_expiry"
                            type="date"
                            value={form.road_tax_expiry}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </label>

                    <label>
                        <span className={labelClass}>Roadworthy Expiry</span>
                        <input
                            name="roadworthy_expiry"
                            type="date"
                            value={form.roadworthy_expiry}
                            onChange={onChange}
                            className={inputClass}
                        />
                    </label>
                </div>
            </Card>

            <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : submitLabel}
                </Button>

                {onCancel && (
                    <Button variant="secondary" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
            </div>
        </form>
    );
}

export { initialVehicleForm, normaliseVehicleForm };
export default VehicleForm;

