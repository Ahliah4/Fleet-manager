import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export default function Test() {
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    async function loadVehicles() {
      const { data, error } = await supabase
        .from("vehicles")
        .select("*");

      if (error) {
        console.error("Error:", error);
      } else {
        setVehicles(data);
      }
    }

    loadVehicles();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">
        Supabase Connection Test
      </h1>

      {vehicles.length === 0 ? (
        <p>No vehicles found.</p>
      ) : (
        vehicles.map((vehicle) => (
          <div
            key={vehicle.id}
            className="border rounded-lg p-4 mb-4 shadow"
          >
            <p><strong>Registration:</strong> {vehicle.registration_number}</p>
            <p><strong>Make:</strong> {vehicle.make}</p>
            <p><strong>Model:</strong> {vehicle.model}</p>
            <p><strong>Road Tax:</strong> {vehicle.road_tax_expiry}</p>
            <p><strong>Insurance:</strong> {vehicle.insurance_expiry}</p>
            <p><strong>Roadworthy:</strong> {vehicle.roadworthy_expiry}</p>
          </div>
        ))
      )}
    </div>
  );
}