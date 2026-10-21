export const initialVehicleForm = {
    registration_number: "",
    make: "",
    model: "",
    year: "",
    colour: "",
    insurance_expiry: "",
    road_tax_expiry: "",
    roadworthy_expiry: "",
    next_service_date: "",
    notes: "",
};

export function normaliseVehicleForm(vehicle = {}) {
    return {
        registration_number: vehicle.registration_number || "",
        make: vehicle.make || "",
        model: vehicle.model || "",
        year: vehicle.year || "",
        colour: vehicle.colour || "",
        insurance_expiry: vehicle.insurance_expiry || "",
        road_tax_expiry: vehicle.road_tax_expiry || "",
        roadworthy_expiry: vehicle.roadworthy_expiry || "",
        next_service_date: vehicle.next_service_date || "",
        notes: vehicle.notes || "",
    };
}
