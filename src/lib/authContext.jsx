import { createContext, useContext, useEffect, useState } from "react";

import { clearFleetCache } from "./fleetScope";
import { supabase } from "./supabaseClient";

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        });

        const { data: listener } = supabase.auth.onAuthStateChange(
            (event, session) => {
                // The cached profile (and its fleet_id) must never leak between
                // accounts. Token refreshes keep the same identity, so keep it.
                if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
                    clearFleetCache();
                }

                setUser(session?.user ?? null);
                setLoading(false);
            }
        );

        return () => {
            listener.subscription.unsubscribe();
        };
    }, []);

    const signUp = (email, password, fullName) =>
        supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
            },
        });

    const signIn = (email, password) =>
        supabase.auth.signInWithPassword({
            email,
            password,
        });

    const signOut = () => supabase.auth.signOut();

    const resetPassword = (email) =>
        supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        });

    const updatePassword = (password) =>
        supabase.auth.updateUser({ password });

    const updateProfile = async ({ fullName }) => {
        const { data, error } = await supabase.auth.updateUser({
            data: { full_name: fullName },
        });

        if (!error && data?.user) setUser(data.user);

        return { data, error };
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                signIn,
                signUp,
                signOut,
                resetPassword,
                updatePassword,
                updateProfile,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
