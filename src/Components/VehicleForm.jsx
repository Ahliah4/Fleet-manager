import Button from "./Button";
import Card from "./Card";

function FieldError({ name, errors }) {
    const message = errors?.[name];

    if (!message) return null;

    return (
        <p id={`${name}-error`} className="mt-1.5 text-xs font-medium text-red-600">
            {message}
        </p>
    );
}

function VehicleForm({
    form,
    saving,
    submitLabel,
    onChange,
    onSubmit,
    onSubmitAndNew,
    onCancel,
    errors = {},
}) {
    const baseInput = "app-input";
    const inputClass = (name) =>
        `${baseInput} ${errors[name] ? "border-red-300 focus:border-red-500 focus:ring-red-500/10" : ""}`;
    const fieldProps = (name) => ({
        id: name,
        name,
        "aria-invalid": errors[name] ? true : undefined,
        "aria-describedby": errors[name] ? `${name}-error` : undefined,
    });
    const labelClass = "mb-1.5 block text-sm font-medium text-slate-700";

    return (
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <Card>
                <h2 className="text-lg font-semibold text-slate-950">
                    Vehicle Information
                </h2>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label htmlFor="registration_number">
                        <span className={labelClass}>Registration Number</span>
                        <input
                            {...fieldProps("registration_number")}
                            value={form.registration_number}
                            onChange={onChange}
                            className={inputClass("registration_number")}
                            placeholder="ABC-1234"
                            maxLength={24}
                            autoCapitalize="characters"
                            autoComplete="off"
                            enterKeyHint="next"
                            required
                        />
                        <FieldError name="registration_number" errors={errors} />
                    </label>

                    <label htmlFor="make">
                        <span className={labelClass}>Make</span>
                        <input
                            {...fieldProps("make")}
                            value={form.make}
                            onChange={onChange}
                            className={inputClass("make")}
                            placeholder="Toyota"
                            maxLength={60}
                            autoComplete="off"
                            enterKeyHint="next"
                            required
                        />
                        <FieldError name="make" errors={errors} />
                    </label>

                    <label htmlFor="model">
                        <span className={labelClass}>Model</span>
                        <input
                            {...fieldProps("model")}
                            value={form.model}
                            onChange={onChange}
                            className={inputClass("model")}
                            placeholder="Hilux"
                            maxLength={60}
                            autoComplete="off"
                            enterKeyHint="next"
                            required
                        />
                        <FieldError name="model" errors={errors} />
                    </label>

                    <label htmlFor="year">
                        <span className={labelClass}>Year</span>
                        <input
                            {...fieldProps("year")}
                            type="number"
                            inputMode="numeric"
                            min="1900"
                            max={new Date().getFullYear() + 1}
                            value={form.year}
                            onChange={onChange}
                            className={inputClass("year")}
                            placeholder={String(new Date().getFullYear())}
                            required
                        />
                        <FieldError name="year" errors={errors} />
                    </label>

                    <label htmlFor="colour">
                        <span className={labelClass}>Colour</span>
                        <input
                            {...fieldProps("colour")}
                            value={form.colour}
                            onChange={onChange}
                            className={inputClass("colour")}
                            placeholder="White"
                            maxLength={40}
                            autoComplete="off"
                        />
                        <FieldError name="colour" errors={errors} />
                    </label>

                    <label htmlFor="next_service_date" className="sm:col-span-2">
                        <span className={labelClass}>Next Service Date</span>
                        <input
                            {...fieldProps("next_service_date")}
                            type="date"
                            value={form.next_service_date}
                            onChange={onChange}
                            className={inputClass("next_service_date")}
                        />
                        <FieldError name="next_service_date" errors={errors} />
                        <span className="mt-1.5 block text-xs text-slate-400">
                            Optional. Enables service reminders (when enabled in Settings).
                        </span>
                    </label>

                    <label htmlFor="notes" className="sm:col-span-2">
                        <span className={labelClass}>Notes</span>
                        <textarea
                            {...fieldProps("notes")}
                            value={form.notes}
                            onChange={onChange}
                            className={inputClass("notes")}
                            placeholder="Anything the team should know about this vehicle."
                            maxLength={2000}
                            rows={4}
                        />
                        <FieldError name="notes" errors={errors} />
                    </label>
                </div>
            </Card>

            <Card>
                <h2 className="text-lg font-semibold text-slate-950">
                    Document Expiry Dates
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                    Leave a date blank if the document is not tracked yet.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label htmlFor="insurance_expiry">
                        <span className={labelClass}>Insurance Expiry</span>
                        <input
                            {...fieldProps("insurance_expiry")}
                            type="date"
                            value={form.insurance_expiry}
                            onChange={onChange}
                            className={inputClass("insurance_expiry")}
                        />
                        <FieldError name="insurance_expiry" errors={errors} />
                    </label>

                    <label htmlFor="road_tax_expiry">
                        <span className={labelClass}>Road Tax Expiry</span>
                        <input
                            {...fieldProps("road_tax_expiry")}
                            type="date"
                            value={form.road_tax_expiry}
                            onChange={onChange}
                            className={inputClass("road_tax_expiry")}
                        />
                        <FieldError name="road_tax_expiry" errors={errors} />
                    </label>

                    <label htmlFor="roadworthy_expiry">
                        <span className={labelClass}>Roadworthy Expiry</span>
                        <input
                            {...fieldProps("roadworthy_expiry")}
                            type="date"
                            value={form.roadworthy_expiry}
                            onChange={onChange}
                            className={inputClass("roadworthy_expiry")}
                        />
                        <FieldError name="roadworthy_expiry" errors={errors} />
                    </label>
                </div>
            </Card>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button type="submit" disabled={saving} className="w-full">
                    {saving ? "Saving..." : submitLabel}
                </Button>

                {onSubmitAndNew ? (
                    <Button
                        variant="secondary"
                        onClick={onSubmitAndNew}
                        disabled={saving}
                        className="w-full"
                    >
                        Save &amp; Add Another
                    </Button>
                ) : onCancel ? (
                    <Button variant="secondary" onClick={onCancel} className="w-full">
                        Cancel
                    </Button>
                ) : null}
            </div>

            {onSubmitAndNew && onCancel && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-sm font-medium text-slate-500 transition hover:text-slate-900"
                    >
                        Cancel and go back
                    </button>
                </div>
            )}
        </form>
    );
}

export default VehicleForm;
