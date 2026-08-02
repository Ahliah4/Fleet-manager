import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import { AuthProvider } from "./lib/authContext";
import ProtectedRoute from "./Components/protectedRoute";

import DashboardLayout from "./Layouts/dashboardLayout";

import Loader from "./Components/Loader";

const Dashboard = lazy(() => import("./Pages/Dashboard"));
const Vehicles = lazy(() => import("./Pages/Vehicles"));
const AddVehicle = lazy(() => import("./Pages/AddVehicle"));
const EditVehicle = lazy(() => import("./Pages/EditVehicle"));
const VehicleDetail = lazy(() => import("./Pages/vehicleDetail"));
const Notifications = lazy(() => import("./Pages/Notifications"));
const Reports = lazy(() => import("./Pages/reports"));
const Settings = lazy(() => import("./Pages/settings"));
const Login = lazy(() => import("./Pages/Login"));
const Register = lazy(() => import("./Pages/Register"));

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<main className="min-h-screen bg-slate-50 p-6"><Loader rows={4} /></main>}>
          <Routes>

          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

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

            <Route path="vehicles/:id/edit" element={<EditVehicle />} />

            <Route
              path="add-vehicle"
              element={<AddVehicle />}
            />

            <Route
              path="reports"
              element={<Reports />}
            />

            <Route path="notifications" element={<Notifications />} />

            <Route
              path="settings"
              element={<Settings />}
            />

          </Route>

          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
