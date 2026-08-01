import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./lib/authContext";
import ProtectedRoute from "./Components/protectedRoute";

import DashboardLayout from "./Layouts/dashboardLayout";

import Dashboard from "./Pages/Dashboard";
import Vehicles from "./Pages/Vehicles";
import AddVehicle from "./Pages/AddVehicle";
import EditVehicle from "./Pages/EditVehicle";
import Notifications from "./Pages/Notifications";
import Reports from "./Pages/reports";
import VehicleDetail from "./Pages/vehicleDetail";
import Settings from "./Pages/settings";
import Login from "./Pages/Login";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>

          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >

            <Route index element={<Dashboard />} />

            <Route
              path="vehicles"
              element={<Vehicles />}
            />

            <Route
              path="vehicles/:id"
              element={<VehicleDetail />}
            />

            <Route
              path="vehicles/:id/edit"
              element={<EditVehicle />}
            />

            <Route
              path="add-vehicle"
              element={<AddVehicle />}
            />

            <Route
              path="notifications"
              element={<Notifications />}
            />

            <Route
              path="reports"
              element={<Reports />}
            />

            <Route
              path="settings"
              element={<Settings />}
            />

          </Route>

        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
