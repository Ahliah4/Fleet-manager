export default function VehicleTable() {

  const vehicles = [

    {
      reg: "BLE3297ZM",
      make: "Honda Fit",
      tax: "🟢",
      insurance: "🟡",
      roadworthy: "🟢",
    },

    {
      reg: "BBE8291ZM",
      make: "Toyota Axio",
      tax: "🔴",
      insurance: "🟢",
      roadworthy: "🟢",
    },

    {
      reg: "BBE9733ZM",
      make: "Mazda Demio",
      tax: "🟢",
      insurance: "🟢",
      roadworthy: "🔴",
    },

  ];

  return (

    <div className="bg-white rounded-3xl shadow-xl mt-10 p-8">

      <div className="flex justify-between mb-6">

        <h2 className="text-2xl font-bold">
          Fleet Vehicles
        </h2>

        <button className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 transition">

          + Add Vehicle

        </button>

      </div>

      <table className="w-full">

        <thead>

          <tr className="text-left border-b">

            <th className="py-4">Registration</th>

            <th>Vehicle</th>

            <th>Road Tax</th>

            <th>Insurance</th>

            <th>Roadworthy</th>

          </tr>

        </thead>

        <tbody>

          {vehicles.map((vehicle) => (

            <tr
              key={vehicle.reg}
              className="border-b hover:bg-slate-50 transition"
            >

              <td className="py-5 font-semibold">

                {vehicle.reg}

              </td>

              <td>{vehicle.make}</td>

              <td className="text-2xl">{vehicle.tax}</td>

              <td className="text-2xl">{vehicle.insurance}</td>

              <td className="text-2xl">{vehicle.roadworthy}</td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

  );

}