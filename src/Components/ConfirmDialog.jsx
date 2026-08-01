import { AlertTriangle } from "lucide-react";

import Button from "./Button";

function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = "Confirm",
    loading = false,
    onCancel,
    onConfirm,
}) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
            <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 text-slate-900 shadow-2xl">
                <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-red-100 p-3 text-red-600">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">
                            {title}
                        </h2>
                        <p className="mt-2 text-sm text-slate-500">
                            {message}
                        </p>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="subtle" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button variant="danger" onClick={onConfirm} disabled={loading}>
                        {loading ? "Working..." : confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmDialog;

