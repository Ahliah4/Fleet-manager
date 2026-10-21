import { Suspense, lazy } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./lib/authContext";
import ProtectedRoute from "./Components/protectedRoute";

import DashboardLayout from "./Layouts/dashboardLayout";

// Every page is loaded on demand. This keeps the initial bundle small and
// isolates heavy dependencies (charts) from the login/dashboard path.
const Dashboard = lazy(() => import("./Pages/Dashboard"));
const Vehicles = lazy(() => import("./Pages/Vehicles"));
const AddVehicle = lazy(() => import("./Pages/AddVehicle"));
const EditVehicle = lazy(() => import("./Pages/EditVehicle"));
const VehicleDetail = lazy(() => import("./Pages/vehicleDetail"));
const Notifications = lazy(() => import("./Pages/Notifications"));
const Settings = lazy(() => import("./Pages/settings"));
const Login = lazy(() => import("./Pages/Login"));
const Register = lazy(() => import("./Pages/Register"));
const ResetPassword = lazy(() => import("./Pages/ResetPassword"));
const Reports = lazy(() => import("./Pages/reports"));
const Team = lazy(() => import("./Pages/Team"));

function PageFallback() {
  return (
    <div className="space-y-3 p-4 sm:p-6" aria-busy="true" aria-label="Loading page">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

function FullPageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-3 text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        Loading IP Motors Fleet Manager...
      </div>
    </div>
  );
}

function Page({ children, fallback = <PageFallback /> }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

function NotFound() {
  return (
    <section className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <p className="text-5xl font-bold text-slate-300">404</p>
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-slate-500">The page you are looking for does not exist or has moved.</p>
      <Link
        to="/"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        Back to dashboard
      </Link>
    </section>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <Page fallback={<FullPageFallback />}>
                <Login />
              </Page>
            }
          />
          <Route
            path="/register"
            element={
              <Page fallback={<FullPageFallback />}>
                <Register />
              </Page>
            }
          />
          <Route
            path="/reset-password"
            element={
              <Page fallback={<FullPageFallback />}>
                <ResetPassword />
              </Page>
            }
          />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Page><Dashboard /></Page>} />
            <Route path="vehicles" element={<Page><Vehicles /></Page>} />
            <Route path="vehicles/:id" element={<Page><VehicleDetail /></Page>} />
            <Route path="vehicles/:id/edit" element={<Page><EditVehicle /></Page>} />
            <Route path="add-vehicle" element={<Page><AddVehicle /></Page>} />
            <Route path="reports" element={<Page><Reports /></Page>} />
            <Route path="notifications" element={<Page><Notifications /></Page>} />
            <Route path="team" element={<Page><Team /></Page>} />
            <Route path="settings" element={<Page><Settings /></Page>} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
