import { supabase } from "./supabaseClient";


export async function checkVehicleAlerts() {

    const today = new Date();


    const { data: vehicles, error } = await supabase
        .from("vehicles")
        .select("*");


    if (error) {

        console.error(
            "Vehicle alert error:",
            error.message
        );

        return;

    }



    for (const vehicle of vehicles) {


        // Insurance
        if (vehicle.insurance_expiry) {

            checkExpiry(
                vehicle,
                vehicle.insurance_expiry,
                "Insurance Expiring Soon",
                "Insurance Expired"
            );

        }



        // Road Tax
        if (vehicle.road_tax_expiry) {

            checkExpiry(
                vehicle,
                vehicle.road_tax_expiry,
                "Road Tax Expiring Soon",
                "Road Tax Expired"
            );

        }



        // Roadworthy
        if (vehicle.roadworthy_expiry) {

            const expiry = new Date(vehicle.roadworthy_expiry);

            const daysLeft = Math.ceil(
                (expiry - today) / (1000 * 60 * 60 * 24)
            );


            if (daysLeft < 0) {

                await createNotification({
                    vehicle,
                    title: "Roadworthy Expired",
                    message:
                    `${vehicle.make} ${vehicle.model} roadworthy certificate has expired.`,
                    type: "danger",
                });

            }

        }

    }

}





async function checkExpiry(
    vehicle,
    expiryDate,
    warningTitle,
    expiredTitle
) {


    const today = new Date();

    const expiry = new Date(expiryDate);


    const daysLeft = Math.ceil(
        (expiry - today) / (1000 * 60 * 60 * 24)
    );



    if (daysLeft <= 30 && daysLeft >= 0) {

        await createNotification({

            vehicle,

            title: warningTitle,

            message:
            `${vehicle.make} ${vehicle.model} document expires in ${daysLeft} days.`,

            type: "warning",

        });

    }



    if (daysLeft < 0) {

        await createNotification({

            vehicle,

            title: expiredTitle,

            message:
            `${vehicle.make} ${vehicle.model} document has expired.`,

            type: "danger",

        });

    }

}






async function createNotification({
    vehicle,
    title,
    message,
    type,
}) {


    const { data: existing, error } = await supabase

        .from("notifications")

        .select("id")

        .eq("vehicle_id", vehicle.id)

        .eq("title", title);



    if (error) {

        console.error(
            "Notification check error:",
            error.message
        );

        return;

    }



    if (existing && existing.length > 0) {

        return;

    }



    const { error: insertError } = await supabase

        .from("notifications")

        .insert([

            {
                vehicle_id: vehicle.id,
                title,
                message,
                type,
                is_read: false,
            }

        ]);



    if (insertError) {

        console.error(
            "Notification insert error:",
            insertError.message
        );

    }

}