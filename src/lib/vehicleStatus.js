export function getStatus(vehicle) {

    const today = new Date();
    const soon = new Date();
    soon.setDate(today.getDate() + 30);

    const checks = [
        { field: vehicle.insurance_expiry, label: "Insurance Due" },
        { field: vehicle.road_tax_expiry, label: "Road Tax Due" },
        { field: vehicle.roadworthy_expiry, label: "Roadworthy Due" },
    ];

    for (const check of checks) {
        if (check.field) {
            const expiryDate = new Date(check.field);
            if (expiryDate < today) return { label: `${check.label} (Expired)`, color: "bg-red-600" };
            if (expiryDate <= soon) return { label: check.label, color: "bg-yellow-600" };
        }
    }

    return { label: "Active", color: "bg-green-600" };

}