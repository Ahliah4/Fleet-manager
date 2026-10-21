import { parseLocalDate, startOfToday } from "./dates";

export const STATUS_WINDOW_DAYS = 30;

const CHECKS = [
    { field: "insurance_expiry", label: "Insurance Due" },
    { field: "road_tax_expiry", label: "Road Tax Due" },
    { field: "roadworthy_expiry", label: "Roadworthy Due" },
    { field: "next_service_date", label: "Service Due" },
];

/**
 * A document expiring today is still valid today. Comparing local midnights
 * avoids the "expired at 00:01 on the expiry date" bug and keeps the overall
 * badge consistent with the per-document badges on the detail page.
 */
export function getStatus(vehicle = {}, { now = new Date() } = {}) {
    const today = startOfToday(now);
    const soon = new Date(today);
    soon.setDate(today.getDate() + STATUS_WINDOW_DAYS);

    for (const check of CHECKS) {
        const expiryDate = parseLocalDate(vehicle[check.field]);

        if (!expiryDate) continue;

        if (expiryDate < today) {
            return { label: `${check.label} (Expired)`, color: "bg-red-600" };
        }

        if (expiryDate <= soon) {
            return { label: check.label, color: "bg-yellow-600" };
        }
    }

    return { label: "Active", color: "bg-green-600" };
}
