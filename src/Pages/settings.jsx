import { useEffect, useState } from "react";
import { BellRing, Car, KeyRound, Save, ShieldCheck, UserRound } from "lucide-react";

import Button from "../Components/Button";
import Card from "../Components/Card";
import Loader from "../Components/Loader";
import StatusBadge from "../Components/StatusBadge";
import { useAuth } from "../lib/authContext";
import { describeError } from "../lib/errors";
import { getCurrentProfile, updateCachedProfile } from "../lib/fleetScope";
import { EXPIRY_WINDOWS, normalizePreferences, preferencesEqual } from "../lib/preferences";
import { supabase } from "../lib/supabaseClient";

function SettingToggle({ label, description, checked = false, onChange, disabled = false, hint }) {
    return (
        <label className={`flex items-start justify-between gap-5 rounded-xl px-1 py-3 transition ${disabled ? "opacity-60" : "cursor-pointer hover:bg-slate-50"}`}>
            <span>
                <span className="block text-sm font-semibold text-slate-800">{label}</span>
                <span className="mt-1 block text-sm text-slate-500">{description}</span>
                {hint && <span className="mt-1 block text-xs font-medium text-blue-600">{hint}</span>}
            </span>
            <input
                aria-label={label}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange?.(event.target.checked)}
                className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
            />
        </label>
    );
}

function Settings() {
    const { user, updateProfile, resetPassword } = useAuth();

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);
    const [name, setName] = useState(user?.user_metadata?.full_name || "");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileNotice, setProfileNotice] = useState(null);
    const [profileError, setProfileError] = useState(null);

    const [fleetName, setFleetName] = useState("");
    const [savedFleetName, setSavedFleetName] = useState("");
    const [savingFleet, setSavingFleet] = useState(false);
    const [fleetNotice, setFleetNotice] = useState(null);
    const [fleetError, setFleetError] = useState(null);

    const [preferences, setPreferences] = useState(normalizePreferences());
    const [savedPreferences, setSavedPreferences] = useState(normalizePreferences());
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [preferencesNotice, setPreferencesNotice] = useState(null);
    const [preferencesError, setPreferencesError] = useState(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const current = await getCurrentProfile({ force: true });
                if (cancelled) return;

                setProfile(current);
                setName(current.full_name || "");

                const prefs = normalizePreferences(current.notification_prefs);
                setPreferences(prefs);
                setSavedPreferences(prefs);

                const { data: fleet, error: fleetLookupError } = await supabase
                    .from("fleets")
                    .select("name")
                    .eq("id", current.fleet_id)
                    .maybeSingle();

                if (!cancelled) {
                    if (fleetLookupError) {
                        setFleetError(describeError(fleetLookupError, "Could not load the fleet name."));
                    } else {
                        setFleetName(fleet?.name || "My fleet");
                        setSavedFleetName(fleet?.name || "My fleet");
                    }
                }
            } catch (loadError) {
                if (!cancelled) {
                    setProfileError(describeError(loadError, "Could not load your settings."));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, []);

    const isAdmin = profile?.role === "admin";
    const preferencesDirty = !preferencesEqual(preferences, savedPreferences);
    const fleetDirty = isAdmin && fleetName.trim() !== savedFleetName;

    const updatePreference = (key, value) => {
        setPreferencesNotice(null);
        setPreferencesError(null);
        setPreferences((current) => ({ ...current, [key]: value }));
    };

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        setProfileError(null);
        setProfileNotice(null);

        const { error: authError } = await updateProfile({ fullName: name });

        if (authError) {
            setSavingProfile(false);
            setProfileError(describeError(authError, "Could not save your profile."));
            return;
        }

        const { error: profileUpdateError } = await supabase.rpc("update_my_profile_name", {
            new_full_name: name.trim(),
        });

        setSavingProfile(false);

        if (profileUpdateError) {
            setProfileError(
                `Your account name was updated, but the team profile was not: ${describeError(profileUpdateError)}. Run supabase/schema.sql to finish setup.`
            );
            return;
        }

        updateCachedProfile({ full_name: name.trim() });
        setProfile((current) => (current ? { ...current, full_name: name.trim() } : current));
        setProfileNotice("Profile updated.");
    };

    const handlePasswordReset = async () => {
        setProfileError(null);
        setProfileNotice(null);

        if (!user?.email) return;

        const { error: resetError } = await resetPassword(user.email);

        if (resetError) {
            setProfileError(describeError(resetError, "Could not start the password reset."));
            return;
        }

        setProfileNotice(`Password reset link sent to ${user.email}.`);
    };

    const handleSavePreferences = async () => {
        setSavingPreferences(true);
        setPreferencesError(null);
        setPreferencesNotice(null);

        const next = normalizePreferences(preferences);

        try {
            const { data, error } = await supabase.rpc("update_my_preferences", {
                new_prefs: next,
            });

            if (error) {
                setPreferencesError(
                    `${describeError(error, "Could not save preferences.")} Run supabase/schema.sql if this is a new installation.`
                );
                return;
            }

            const saved = normalizePreferences(data || next);
            setPreferences(saved);
            setSavedPreferences(saved);
            updateCachedProfile({ notification_prefs: saved });
            setPreferencesNotice("Notification preferences saved.");
        } catch (saveError) {
            setPreferencesError(describeError(saveError, "Could not save preferences."));
        } finally {
            setSavingPreferences(false);
        }
    };

    const handleRenameFleet = async () => {
        const nextName = fleetName.trim();

        if (!nextName) {
            setFleetError("Fleet name cannot be empty.");
            return;
        }

        setSavingFleet(true);
        setFleetError(null);
        setFleetNotice(null);

        const { error } = await supabase.rpc("update_my_fleet_name", {
            new_name: nextName,
        });

        setSavingFleet(false);

        if (error) {
            setFleetError(
                `${describeError(error, "Could not rename the fleet.")} Run supabase/schema.sql if this is a new installation.`
            );
            return;
        }

        setSavedFleetName(nextName);
        setFleetNotice("Fleet name updated.");
    };

    if (loading) {
        return (
            <section className="mx-auto max-w-5xl space-y-6">
                <Loader rows={4} />
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-5xl space-y-6">
            <div>
                <h1 className="page-title">Settings</h1>
                <p className="page-description">Manage your account, fleet, and notification preferences.</p>
            </div>

            {profileError && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {profileError}
                </div>
            )}

            {profileNotice && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {profileNotice}
                </div>
            )}

            <Card>
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><UserRound size={20} /></div>
                    <div><h2 className="text-lg font-semibold text-slate-950">Profile</h2><p className="mt-1 text-sm text-slate-500">Your account details are managed securely through Supabase.</p></div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label>
                        <span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span>
                        <input
                            className="app-input"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Your name"
                            autoComplete="name"
                        />
                    </label>
                    <label>
                        <span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span>
                        <input className="app-input bg-slate-50 text-slate-500" defaultValue={user?.email || ""} readOnly />
                    </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    <Button onClick={handleSaveProfile} disabled={savingProfile}>
                        <Save size={16} />
                        {savingProfile ? "Saving..." : "Save profile"}
                    </Button>
                    <Button variant="secondary" onClick={handlePasswordReset}>
                        <KeyRound size={16} />
                        Send password reset
                    </Button>
                </div>
            </Card>

            <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><Car size={20} /></div>
                        <div><h2 className="text-lg font-semibold text-slate-950">Fleet</h2><p className="mt-1 text-sm text-slate-500">Everyone in this fleet shares the same vehicles and alerts.</p></div>
                    </div>
                    {profile?.role && (
                        <StatusBadge type={isAdmin ? "unread" : "active"}>
                            <ShieldCheck size={12} className="mr-1" />
                            {isAdmin ? "Admin" : "Member"}
                        </StatusBadge>
                    )}
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1">
                        <span className="mb-1.5 block text-sm font-medium text-slate-700">Fleet name</span>
                        <input
                            className="app-input disabled:bg-slate-50 disabled:text-slate-500"
                            value={fleetName}
                            onChange={(event) => {
                                setFleetNotice(null);
                                setFleetName(event.target.value);
                            }}
                            disabled={!isAdmin}
                            maxLength={60}
                        />
                    </label>

                    {isAdmin && (
                        <Button onClick={handleRenameFleet} disabled={!fleetDirty || savingFleet}>
                            {savingFleet ? "Saving..." : "Rename fleet"}
                        </Button>
                    )}
                </div>

                {fleetError && (
                    <p role="alert" className="mt-3 text-sm text-red-600">{fleetError}</p>
                )}
                {fleetNotice && (
                    <p role="status" className="mt-3 text-sm text-emerald-700">{fleetNotice}</p>
                )}
            </Card>

            <Card>
                <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><BellRing size={20} /></div><div><h2 className="text-lg font-semibold text-slate-950">Notifications</h2><p className="mt-1 text-sm text-slate-500">Choose which activity needs your attention. Preferences apply to your account.</p></div></div>

                <div className="mt-5 divide-y divide-slate-100">
                    <SettingToggle
                        label="Email notifications"
                        description="Receive important fleet updates by email."
                        checked={false}
                        disabled
                        hint="Coming soon — email delivery is not connected yet."
                    />
                    <SettingToggle
                        label="Document expiry alerts"
                        description="Create alerts for insurance, road tax, and roadworthy documents."
                        checked={preferences.expiryAlerts}
                        onChange={(value) => updatePreference("expiryAlerts", value)}
                    />
                    <SettingToggle
                        label="Maintenance reminders"
                        description="Create alerts when a vehicle's next service date is near."
                        checked={preferences.maintenanceReminders}
                        onChange={(value) => updatePreference("maintenanceReminders", value)}
                    />
                </div>

                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                    <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                            <span className="block text-sm font-semibold text-slate-800">Alert window</span>
                            <span className="mt-1 block text-sm text-slate-500">How early to warn you about upcoming expiry dates.</span>
                        </span>
                        <select
                            className="app-input sm:max-w-44"
                            value={preferences.expiryWindow}
                            disabled={!preferences.expiryAlerts}
                            onChange={(event) => updatePreference("expiryWindow", Number(event.target.value))}
                        >
                            {EXPIRY_WINDOWS.map((days) => (
                                <option key={days} value={days}>
                                    {days} days before
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                {preferencesError && (
                    <p role="alert" className="mt-4 text-sm text-red-600">{preferencesError}</p>
                )}
                {preferencesNotice && (
                    <p role="status" className="mt-4 text-sm text-emerald-700">{preferencesNotice}</p>
                )}

                <div className="mt-5">
                    <Button onClick={handleSavePreferences} disabled={!preferencesDirty || savingPreferences}>
                        <Save size={16} />
                        {savingPreferences ? "Saving..." : "Save preferences"}
                    </Button>
                </div>
            </Card>
        </section>
    );
}

export default Settings;
