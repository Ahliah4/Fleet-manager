import { getStatus } from "./vehicleStatus";

const dateFields = [
    "insurance_expiry",
    "road_tax_expiry",
    "roadworthy_expiry",
];

export function toDate(value) {
    if (!value) return null;
    return String(value).includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
}

export function formatDate(value) {
    if (!value) return "Not set";

    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(toDate(value));
}

export function daysUntil(value) {
    const date = toDate(value);
    if (!date) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Math.ceil((date - today) / (1000 * 60 * 60 * 24));
}

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
    return [
        {
            name: "Insurance",
            value: vehicle.insurance_expiry,
        },
        {
            name: "Road Tax",
            value: vehicle.road_tax_expiry,
        },
        {
            name: "Roadworthy",
            value: vehicle.roadworthy_expiry,
        },
    ].map((item) => {
        const days = daysUntil(item.value);
        const state = days === null
            ? "missing"
            : days < 0
                ? "expired"
                : days <= 30
                    ? "dueSoon"
                    : "active";

        return {
            ...item,
            days,
            state,
        };
    });
}

export function getMonthlyRegistrations(vehicles) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const months = monthNames.map((month) => ({
        month,
        vehicles: 0,
    }));

    vehicles.forEach((vehicle) => {
        const createdAt = vehicle.created_at ? new Date(vehicle.created_at) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return;

        months[createdAt.getMonth()].vehicles += 1;
    });

    return months;
}
