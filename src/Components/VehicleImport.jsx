import { useRef, useState } from "react";
import { Check, Upload } from "lucide-react";
import { importSharedVehicles } from "../lib/sharedFleet";
import { parseVehicleCsv } from "../lib/vehicleCsv";

const MAX_BYTES = 2 * 1024 * 1024;

function Summary({ label, value, tone = "ink" }) {
    return <div className={`rounded-xl border px-3 py-3 ${tone === "warn" ? "border-amber-300 bg-amber-50" : "border-stone/70 bg-canvas"}`}><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/55">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>;
}

export default function VehicleImport({ data, onImported, setError, setMessage }) {
    const inputRef = useRef(null);
    const [fileName, setFileName] = useState("");
    const [preview, setPreview] = useState(null);
    const [importing, setImporting] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState(null);

    const reset = () => {
        setFileName("");
        setPreview(null);
        setResult(null);
        setProgress({ done: 0, total: 0 });
        if (inputRef.current) inputRef.current.value = "";
    };

    const choose = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setError("");
        setMessage("");
        setResult(null);
        setPreview(null);
        setFileName(file.name);
        if (file.size > MAX_BYTES) {
            setError("That CSV is larger than 2 MB. Split it into smaller files.");
            reset();
            return;
        }
        try {
            const parsed = parseVehicleCsv(await file.text(), data.vehicles);
            if (parsed.error) {
                setError(parsed.error);
                setFileName("");
                return;
            }
            setPreview(parsed);
            if (parsed.vehicles.length === 0) {
                setMessage("No new vehicles were found in that file.");
            }
        } catch {
            setError("The CSV could not be read. Check the file and try again.");
        }
    };

    const run = async () => {
        if (!preview?.vehicles.length) return;
        setImporting(true);
        setError("");
        setMessage("");
        setResult(null);
        setProgress({ done: 0, total: preview.vehicles.length });
        try {
            const outcome = await importSharedVehicles(preview.vehicles, (done, total) => setProgress({ done, total }));
            setResult(outcome);
            setPreview(null);
            if (outcome.imported > 0) {
                setMessage(`${outcome.imported} vehicle${outcome.imported === 1 ? "" : "s"} imported into the shared fleet.`);
                onImported?.();
            }
            if (outcome.failed > 0) {
                setError(`${outcome.failed} vehicle${outcome.failed === 1 ? "" : "s"} could not be imported. Check the details below.`);
            }
        } catch (problem) {
            setError(problem?.message || "The import could not be completed.");
        } finally {
            setImporting(false);
        }
    };

    const issues = preview ? [...preview.duplicates, ...preview.invalid] : [];

    return <Card className="max-w-3xl">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><Upload size={20} /></span>
        <h2 className="mt-4 text-lg font-semibold">Import vehicles from CSV</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">Add several vehicles at once. The file needs Registration, Make, and Model columns. Year and the expiry dates are optional; dates use YYYY-MM-DD. Existing registrations are skipped.</p>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={choose} className="sr-only" aria-label="Choose a vehicle CSV file" />
        <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" disabled={importing} onClick={() => inputRef.current?.click()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-stone px-4 text-sm font-semibold disabled:opacity-50"><Upload size={17} />Choose CSV file</button>
            {fileName && <span className="text-sm text-ink/60">{fileName}</span>}
        </div>

        {preview && <div className="mt-5 space-y-4">
            <div className="grid grid-cols-3 gap-2"><Summary label="Ready" value={preview.vehicles.length} /><Summary label="Duplicates" value={preview.duplicates.length} tone={preview.duplicates.length ? "warn" : "ink"} /><Summary label="Invalid" value={preview.invalid.length} tone={preview.invalid.length ? "warn" : "ink"} /></div>
            {issues.length > 0 && <div className="rounded-xl border border-stone/70 bg-white"><p className="border-b border-stone/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/55">Rows to review</p><ul className="max-h-48 divide-y divide-stone/60 overflow-y-auto text-sm">{issues.slice(0, 20).map((issue) => <li key={`${issue.row}-${issue.registration}`} className="px-3 py-2"><span className="font-medium">Row {issue.row}{issue.registration ? ` · ${issue.registration}` : ""}</span><span className="block text-ink/60">{issue.reason}</span></li>)}</ul>{issues.length > 20 && <p className="px-3 py-2 text-xs text-ink/55">Showing the first 20 issues.</p>}</div>}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={importing || preview.vehicles.length === 0} onClick={run} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"><Check size={17} />{importing ? `Importing ${progress.done} of ${progress.total}…` : `Import ${preview.vehicles.length} vehicle${preview.vehicles.length === 1 ? "" : "s"}`}</button><button type="button" disabled={importing} onClick={reset} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-ink/65 hover:bg-stone/40 disabled:opacity-50">Cancel</button></div>
        </div>}

        {result && <div className="mt-5 space-y-3">
            <div className="grid grid-cols-2 gap-2"><Summary label="Imported" value={result.imported} /><Summary label="Failed" value={result.failed} tone={result.failed ? "warn" : "ink"} /></div>
            {result.errors.length > 0 && <ul className="max-h-40 divide-y divide-stone/60 overflow-y-auto rounded-xl border border-stone/70 bg-white text-sm">{result.errors.slice(0, 20).map((item) => <li key={item.registration} className="px-3 py-2"><span className="font-medium">{item.registration}</span><span className="block text-ink/60">{item.message}</span></li>)}</ul>}
            <button type="button" onClick={reset} className="min-h-11 rounded-xl border border-stone px-4 text-sm font-semibold">Import another file</button>
        </div>}

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm leading-6 text-ink/65"><ShieldAlertIcon /><p>The import writes straight to the shared fleet. Review the ready, duplicate, and invalid counts before you confirm.</p></div>
    </Card>;
}

function ShieldAlertIcon() {
    return <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-white">!</span>;
}

function Card({ children, className = "" }) {
    return <section className={`rounded-2xl border border-stone/70 bg-white p-4 sm:p-5 ${className}`}>{children}</section>;
}
