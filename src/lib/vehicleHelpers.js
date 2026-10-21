import { daysUntil, formatDate, parseLocalDate } from "./dates";
import { getStatus, STATUS_WINDOW_DAYS } from "./vehicleStatus";

const dateFields = [
    "insurance_expiry",
    "road_tax_expiry",
    "roadworthy_expiry",
    "next_service_date",
];

const documentFields = [
    { name: "Insurance", field: "insurance_expiry" },
    { name: "Road Tax", field: "road_tax_expiry" },
    { name: "Roadworthy", field: "roadworthy_expiry" },
    { name: "Service", field: "next_service_date" },
];

// Re-exported so pages can keep importing date helpers from one place.
export { daysUntil, formatDate, parseLocalDate };

export function getVehicleStatusType(vehicle) {
    const status = getStatus(vehicle);

    if (status.label.includes("Expired")) return "expired";
    if (status.label !== "Active") return "dueSoon";
    return "active";
}

export function addStatus(vehicles) {
    return vehicles.map((vehicle) => ({
        ...vehicle,
        status: getStatus(vehicle),
        statusType: getVehicleStatusType(vehicle),
    }));
}

export function getSoonestExpiry(vehicle) {
    return dateFields
        .map((field) => ({
            field,
            value: vehicle[field],
            days: daysUntil(vehicle[field]),
        }))
        .filter((item) => item.days !== null)
        .sort((a, b) => a.days - b.days)[0];
}

export function getDocumentRows(vehicle) {
    return documentFields.map(({ name, field }) => {
        const days = daysUntil(vehicle[field]);
        const state = days === null
            ? "missing"
            : days < 0
                ? "expired"
                : days <= STATUS_WINDOW_DAYS
                    ? "dueSoon"
                    : "active";

        return {
            name,
            field,
            value: vehicle[field],
            days,
            state,
        };
    });
}

/**
 * Rolling 12-month registration chart. Months are keyed by year + month so
 * January 2025 never absorbs January 2024's count.
 */
export function getMonthlyRegistrations(vehicles, now = new Date()) {
    const monthFormatter = new Intl.DateTimeFormat("en", { month: "short" });
    const yearFormatter = new Intl.DateTimeFormat("en", { year: "2-digit" });
    const months = Array.from({ length: 12 }, (_, index) => {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
        const key = `${date.getFullYear()}-${date.getMonth()}`;

        return {
            key,
            month: `${monthFormatter.format(date)} '${yearFormatter.format(date)}`,
            vehicles: 0,
        };
    });
    const counts = new Map(months.map((month) => [month.key, month]));

    vehicles.forEach((vehicle) => {
        const createdAt = parseLocalDate(vehicle.created_at);
        if (!createdAt) return;

        const month = counts.get(`${createdAt.getFullYear()}-${createdAt.getMonth()}`);
        if (month) month.vehicles += 1;
    });

    return months.map(({ month, vehicles: count }) => ({ month, vehicles: count }));
}
