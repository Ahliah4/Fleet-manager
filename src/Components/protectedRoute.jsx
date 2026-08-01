import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";


function ProtectedRoute({ children }) {

    const { user, loading } = useAuth();

    if (loading) {
        return <p className="text-gray-500 p-8">Loading...</p>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;

}

export default ProtectedRoute;