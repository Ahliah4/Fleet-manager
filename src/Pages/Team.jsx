import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserPlus, Users } from "lucide-react";

import Button from "../Components/Button";
import Card from "../Components/Card";
import Loader from "../Components/Loader";
import StatusBadge from "../Components/StatusBadge";
import { useAuth } from "../lib/authContext";
import { describeError } from "../lib/errors";
import { getCurrentProfile } from "../lib/fleetScope";
import { supabase } from "../lib/supabaseClient";

const emptyForm = {
    fullName: "",
    email: "",
    password: "",
    role: "member",
};

function isMissingTable(error) {
    return (
        error?.code === "42P01" ||
        error?.code === "42703" ||
        error?.code === "PGRST204" ||
        error?.code === "PGRST205" ||
        /could not find the table .*profiles/i.test(error?.message || "") ||
        /column .* does not exist/i.test(error?.message || "")
    );
}

function formatJoined(value) {
    if (!value) return "—";

    return new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(value));
}

function Team() {
    const { user } = useAuth();
    const [members, setMembers] = useState([]);
    const [currentRole, setCurrentRole] = useState(null);
    const [loading, setLoading] = useState(true);
    const [setupRequired, setSetupRequired] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [creating, setCreating] = useState(false);
    const [fleetName, setFleetName] = useState("");
    const [updatingId, setUpdatingId] = useState(null);

    const loadMembers = useCallback(async () => {
        const { data, error: fetchError } = await supabase
            .from("profiles")
            .select("id,full_name,email,role,created_at")
            .order("created_at", { ascending: true });

        if (fetchError) {
            if (isMissingTable(fetchError)) {
                setSetupRequired(true);
            } else {
                setError(describeError(fetchError, "Failed to load team members."));
            }
            setLoading(false);
            return;
        }

        const list = data || [];
        setMembers(list);
        setCurrentRole(list.find((member) => member.id === user?.id)?.role || "member");

        try {
            const profile = await getCurrentProfile({ force: true });
            const { data: fleet } = await supabase
                .from("fleets")
                .select("name")
                .eq("id", profile.fleet_id)
                .maybeSingle();

            setFleetName(fleet?.name || "");
        } catch {
            // The member list is the important part; the fleet name is cosmetic.
        }

        setLoading(false);
    }, [user?.id]);

    useEffect(() => {
        loadMembers();
    }, [loadMembers]);

    const handleChange = (event) => {
        setNotice(null);
        setForm((current) => ({
            ...current,
            [event.target.name]: event.target.value,
        }));
    };

    const handleCreate = async (event) => {
        event.preventDefault();

        setError(null);
        setNotice(null);

        if (!form.email.trim() || form.password.length < 8) {
            setError("Enter an email and a password of at least 8 characters.");
            return;
        }

        setCreating(true);

        const { data, error: invokeError } = await supabase.functions.invoke(
            "admin-create-user",
            {
                body: {
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    fullName: form.fullName.trim(),
                    role: form.role,
                },
            }
        );

        setCreating(false);

        if (invokeError || data?.error) {
            const message = data?.error || describeError(invokeError, "Could not create the user.");

            setError(
                message.includes("Failed to send a request")
                    ? "The admin-create-user function is not deployed yet. See supabase/functions/admin-create-user and deploy it, then try again."
                    : message
            );
            return;
        }

        setNotice(`Account created for ${data?.user?.email || form.email}. They can now sign in and share this fleet.`);
        setForm(emptyForm);
        loadMembers();
    };

    const handleRoleChange = async (member, role) => {
        if (role === member.role) return;

        setError(null);
        setNotice(null);

        const adminCount = members.filter((item) => item.role === "admin").length;

        if (member.role === "admin" && role !== "admin" && adminCount <= 1) {
            setError("This is the only admin. Promote another member before changing this role.");
            return;
        }

        setUpdatingId(member.id);

        const { error: updateError } = await supabase
            .from("profiles")
            .update({ role })
            .eq("id", member.id);

        setUpdatingId(null);

        if (updateError) {
            setError(describeError(updateError, "Could not change this member's role."));
            return;
        }

        setMembers((current) =>
            current.map((item) => (item.id === member.id ? { ...item, role } : item))
        );

        if (member.id === user?.id) setCurrentRole(role);

        setNotice(`${member.full_name || member.email} is now ${role === "admin" ? "an admin" : "a member"}.`);
    };

    if (loading) {
        return (
            <section className="space-y-6">
                <Loader rows={4} />
            </section>
        );
    }

    return (
        <section className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h1 className="page-title">Team</h1>
                    <p className="page-description">
                        {fleetName
                            ? `Manage who can access ${fleetName}. Everyone here shares the same vehicles and alerts.`
                            : "Add the people who manage your fleet and control their access."}
                    </p>
                </div>

                {currentRole && (
                    <StatusBadge type={currentRole === "admin" ? "unread" : "active"}>
                        {currentRole === "admin" ? "Admin access" : "Member access"}
                    </StatusBadge>
                )}
            </div>

            {setupRequired && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    <p className="font-semibold">One-time setup needed</p>
                    <p className="mt-1">
                        Run the SQL in <code className="rounded bg-white/70 px-1">supabase/schema.sql</code>{" "}
                        in your Supabase SQL editor to enable team accounts, then reload this page.
                    </p>
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
                    {error}
                </div>
            )}

            {notice && (
                <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {notice}
                </div>
            )}

            {!setupRequired && currentRole === "admin" && (
                <Card>
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                            <UserPlus size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">Create a user</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Create an account with a temporary password. The new user joins this fleet
                                and can change their password after signing in.
                            </p>
                        </div>
                    </div>

                    <form onSubmit={handleCreate} className="mt-5 grid gap-4 sm:grid-cols-2">
                        <label>
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span>
                            <input
                                name="fullName"
                                value={form.fullName}
                                onChange={handleChange}
                                className="app-input"
                                placeholder="Jane Doe"
                                autoComplete="name"
                            />
                        </label>

                        <label>
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
                            <input
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                className="app-input"
                                placeholder="jane@company.com"
                                autoComplete="email"
                                required
                            />
                        </label>

                        <label>
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Temporary password</span>
                            <input
                                name="password"
                                type="password"
                                value={form.password}
                                onChange={handleChange}
                                className="app-input"
                                placeholder="At least 8 characters"
                                minLength={8}
                                autoComplete="new-password"
                                required
                            />
                        </label>

                        <label>
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span>
                            <select
                                name="role"
                                value={form.role}
                                onChange={handleChange}
                                className="app-input"
                            >
                                <option value="member">Member</option>
                                <option value="admin">Admin</option>
                            </select>
                        </label>

                        <div className="sm:col-span-2">
                            <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                                <UserPlus size={18} />
                                {creating ? "Creating..." : "Create user"}
                            </Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="p-0">
                <div className="flex items-center gap-3 border-b border-slate-100 p-4 sm:p-6">
                    <div className="rounded-xl bg-slate-100 p-2.5 text-slate-600">
                        <Users size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">Members</h2>
                        <p className="text-sm text-slate-500">
                            {members.length} account{members.length === 1 ? "" : "s"} with access.
                        </p>
                    </div>
                </div>

                {members.length === 0 ? (
                    <p className="p-6 text-sm text-slate-500">No team members found yet.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {members.map((member) => (
                            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-6">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
                                        {(member.full_name || member.email || "?")
                                            .trim()
                                            .charAt(0)
                                            .toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-900">
                                            {member.full_name || "Unnamed user"}
                                            {member.id === user?.id && (
                                                <span className="ml-2 text-xs font-medium text-slate-400">(you)</span>
                                            )}
                                        </p>
                                        <p className="text-sm text-slate-500">{member.email}</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs text-slate-400">
                                        Joined {formatJoined(member.created_at)}
                                    </span>

                                    {currentRole === "admin" ? (
                                        <label className="flex items-center gap-2">
                                            <span className="sr-only">
                                                Role for {member.full_name || member.email}
                                            </span>
                                            <select
                                                value={member.role}
                                                disabled={updatingId === member.id}
                                                onChange={(event) => handleRoleChange(member, event.target.value)}
                                                className="app-input min-h-[40px] w-auto py-2 text-xs"
                                            >
                                                <option value="member">Member</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </label>
                                    ) : (
                                        <StatusBadge type={member.role === "admin" ? "unread" : "active"}>
                                            <ShieldCheck size={12} className="mr-1" />
                                            {member.role === "admin" ? "Admin" : "Member"}
                                        </StatusBadge>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
        </section>
    );
}

export default Team;
