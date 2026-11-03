import { useCallback, useEffect, useState } from "react";
import {
    Activity, ArrowDownRight, ArrowUpRight, CarFront, Check, ChevronRight,
    CircleDollarSign, Download, FileText, LayoutDashboard, LogIn, LogOut, Menu, Plus,
    Search, Settings, ShieldAlert, Trash2, Users, Wrench, X,
} from "lucide-react";
import InstallPrompt from "./Components/InstallPrompt";
import BrandLogo from "./Components/BrandLogo";
import VehicleImport from "./Components/VehicleImport";
import { daysUntil, formatDate as formatDisplayDate } from "./lib/dates";
import { deleteSharedRecord, loadSharedFleet, saveSharedRecord, signOutSharedFleet } from "./lib/sharedFleet";

const NAV = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, permissions: [] },
    { id: "vehicles", label: "Vehicles", icon: CarFront, permissions: ["fleet.vehicles.read", "finance.context.read"] },
    { id: "drivers", label: "Drivers", icon: Users, permissions: ["fleet.operations.read", "finance.context.read"] },
    { id: "maintenance", label: "Maintenance & expenses", icon: Wrench, permissions: ["finance.expenses.read"] },
    { id: "finance", label: "Income & remittances", icon: CircleDollarSign, permissions: ["finance.income.read", "finance.remittances.read"] },
    { id: "backup", label: "Backup & settings", icon: Settings, permissions: [] },
];

const CATEGORIES = ["Parts", "Engine oil & fluids", "Tyres", "Repairs", "Service", "Inspection", "Other"];
const EMPTY = { vehicles: [], drivers: [], expenses: [], income: [], remittances: [] };

function formatMoney(value) {
    return new Intl.NumberFormat("en-ZM", { style: "currency", currency: "ZMW", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function dateToday() {
    const date = new Date();
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(value) {
    return formatDisplayDate(value, "—");
}

function roleLabel(role) {
    return ({ fleet_owner: "Fleet Owner", fleet_admin: "Fleet Admin", fleet_manager: "Fleet Manager", finance_manager: "Finance Manager", fleet_member: "Fleet Member", read_only: "Read only" })[role] || "Fleet user";
}

function AuthLoading() {
    return <main className="grid min-h-[100dvh] place-items-center bg-ink px-5 text-white"><div className="text-center"><BrandLogo /><p className="mt-5 text-sm text-white/65">Opening your shared fleet…</p></div></main>;
}

function SignInScreen({ error }) {
    return <main className="min-h-[100dvh] bg-canvas text-ink sm:grid sm:place-items-center sm:p-6">
        <section className="mx-auto min-h-[100dvh] w-full max-w-md overflow-hidden bg-white sm:min-h-0 sm:rounded-[28px] sm:border sm:border-stone sm:shadow-2xl">
            <div className="bg-ink px-7 pb-8 pt-[max(2.25rem,env(safe-area-inset-top))] text-white"><BrandLogo /><p className="text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">Fleet Operations</p></div>
            <div className="space-y-5 px-6 py-7 pb-[max(2rem,env(safe-area-inset-bottom))]">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/50">Shared fleet</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Sign in to your fleet</h1><p className="mt-2 text-sm leading-6 text-ink/60">Use your verified account to manage the same records from iPhone, Android, or computer.</p></div>
                {error && <p role="alert" className="rounded-xl border border-brand-500/30 bg-brand-50 px-4 py-3 text-sm text-brand-800">{error}</p>}
                <a href="/auth/start" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 text-sm font-semibold text-white active:scale-[0.99]"><LogIn size={18} />Sign in securely</a>
                <a href="/auth/start?mode=signup" className="flex min-h-12 w-full items-center justify-center rounded-xl border border-stone px-5 text-sm font-semibold active:bg-canvas">Create an account</a>
                <p className="text-center text-xs leading-5 text-ink/50">Fleet access and roles are assigned by the Fleet Owner.</p>
            </div>
        </section>
    </main>;
}

function BlockedScreen({ error, onSignOut }) {
    return <main className="grid min-h-[100dvh] place-items-center bg-canvas px-5 text-ink">
        <section className="w-full max-w-md rounded-2xl border border-stone bg-white p-6 text-center shadow-sm">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-ink text-white"><ShieldAlert size={22} /></span>
            <h1 className="mt-4 text-xl font-semibold">Fleet access needs attention</h1>
            <p className="mt-2 text-sm leading-6 text-ink/65">{error.message}</p>
            {error.code && <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink/45">{error.code}</p>}
            <button type="button" onClick={onSignOut} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white"><LogOut size={17} />Sign out</button>
        </section>
    </main>;
}

function App() {
    const [data, setData] = useState(EMPTY);
    const [page, setPage] = useState("dashboard");
    const [search, setSearch] = useState("");
    const [formType, setFormType] = useState("");
    const [editing, setEditing] = useState(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [signedOut, setSignedOut] = useState(false);
    const [me, setMe] = useState(null);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [blocked, setBlocked] = useState(null);
    const permissions = new Set(me?.membership?.permissions || []);
    const visibleNav = NAV.filter((item) => item.permissions.length === 0 || item.permissions.some((permission) => permissions.has(permission)));

    const refresh = useCallback(async () => {
        try {
            const shared = await loadSharedFleet();
            setData(shared.data);
            setMe(shared.me);
            setSignedOut(false);
            setBlocked(null);
            setError("");
        } catch (loadError) {
            if (loadError?.status === 401) {
                setSignedOut(true);
                const authError = new URL(window.location.href).searchParams.get("auth_error");
                setError(authError ? "Sign-in could not be completed. Please try again." : "");
                if (authError) history.replaceState({}, document.title, window.location.pathname);
            } else if (loadError?.status === 403) {
                setBlocked({ message: loadError?.message || "This account does not have fleet access yet.", code: loadError?.code });
            } else {
                setError(loadError?.message || "Could not open the shared fleet.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const openForm = (type, record = null) => {
        setEditing(record);
        setFormType(type);
        setMessage("");
    };

    const persist = async (store, record, success) => {
        try {
            await saveSharedRecord(store, record);
            await refresh();
            setFormType("");
            setEditing(null);
            setMessage(success);
        } catch (saveError) {
            setError(saveError?.message || "We couldn’t save that. Try again.");
        }
    };

    const remove = async (store, record, label) => {
        const hasLinkedFinancials = store === "vehicles" && [...data.expenses, ...data.income, ...data.remittances].some((item) => item.vehicleId === record.id);
        const hasAssignedVehicles = store === "drivers" && data.vehicles.some((vehicle) => vehicle.assignedDriverId === record.id);
        if (hasLinkedFinancials) {
            setError("This vehicle has financial history. Change its status to Unavailable instead so those records remain attached.");
            return;
        }
        if (hasAssignedVehicles) {
            setError("This driver is assigned to a vehicle. Remove the vehicle assignment before deleting the driver.");
            return;
        }
        if (!window.confirm(`Delete ${label}? This action cannot be undone on this device.`)) return;
        try {
            await deleteSharedRecord(store, record.id);
            await refresh();
            setMessage(`${label} deleted.`);
        } catch (deleteError) {
            setError(deleteError?.message || "We couldn’t delete that record.");
        }
    };

    const title = visibleNav.find((item) => item.id === page)?.label || "Dashboard";

    useEffect(() => {
        if (me && !visibleNav.some((item) => item.id === page)) setPage("dashboard");
    }, [me, page, visibleNav]);

    const signOut = async () => {
        await signOutSharedFleet().catch(() => undefined);
        setData(EMPTY);
        setMe(null);
        setBlocked(null);
        setSignedOut(true);
    };

    if (loading) return <AuthLoading />;
    if (signedOut) return <SignInScreen error={error} />;
    if (blocked) return <BlockedScreen error={blocked} onSignOut={signOut} />;

    return (
        <div className="min-h-screen bg-canvas text-ink lg:flex">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
            {menuOpen && <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />}
            <aside className={`fixed inset-y-0 left-0 z-50 flex w-[276px] flex-col bg-ink px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="mb-8 flex items-center justify-between px-1">
                    <BrandLogo compact />
                    <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden"><X size={19} /></button>
                </div>
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">Fleet workspace</p>
                <nav aria-label="Main navigation" className="flex-1 space-y-1">
                    {visibleNav.map(({ id, label, icon: Icon }) => (
                        <button key={id} type="button" onClick={() => { setPage(id); setSearch(""); setMenuOpen(false); setError(""); setMessage(""); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${page === id ? "bg-white text-ink" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                            <Icon size={18} />{label}
                        </button>
                    ))}
                </nav>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-xs leading-5 text-white/60">
                    <span className="mb-1 flex items-center gap-2 font-semibold text-white"><Activity size={14} /> Shared fleet online</span>
                    Changes are saved to the protected workspace for authorized team members.
                </div>
            </aside>

            <div className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between border-b border-stone/70 bg-white px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-ink hover:bg-canvas lg:hidden" aria-label="Open navigation"><Menu size={21} /></button>
                        <div><p className="text-xs font-medium text-ink/55">IP Motors Fleet</p><p className="font-semibold leading-5">{title}</p></div>
                    </div>
                    <div className="hidden max-w-md flex-1 px-8 md:block">
                        <label className="relative block">
                            <span className="sr-only">Search this page</span><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" />
                            <input className="min-h-10 w-full rounded-xl border border-stone/70 bg-canvas pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink/45 focus:border-ink" placeholder="Search this page…" value={search} onChange={(event) => setSearch(event.target.value)} />
                        </label>
                    </div>
                    <div className="flex items-center gap-2"><span className="hidden text-right text-xs text-ink/60 sm:block"><strong className="block text-ink">{me?.user?.displayName || me?.user?.email || "Fleet user"}</strong>{roleLabel(me?.membership?.role)}</span><button type="button" onClick={signOut} className="grid h-10 w-10 place-items-center rounded-full bg-ink text-white" aria-label="Sign out"><LogOut size={17} /></button></div>
                </header>

                {["vehicles", "drivers", "maintenance", "finance"].includes(page) && <div className="border-b border-stone/70 bg-white px-4 py-2 md:hidden"><label className="relative block"><span className="sr-only">Search {title.toLowerCase()}</span><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/45" /><input className="min-h-10 w-full rounded-xl border border-stone/70 bg-canvas pl-10 pr-3 text-sm text-ink outline-none placeholder:text-ink/45 focus:border-ink" placeholder="Search by vehicle, driver, or item…" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>}

                <main id="main-content" className="mx-auto w-full max-w-[1440px] space-y-5 p-4 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-28 lg:p-8">
                    {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-brand-500/30 bg-white px-4 py-3 text-sm text-ink"><p>{error}</p><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={17} /></button></div>}
                    {message && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-stone bg-white px-4 py-3 text-sm text-ink"><p className="flex items-center gap-2"><Check size={16} />{message}</p><button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}><X size={17} /></button></div>}
                    <>
                            {page === "dashboard" && <Dashboard data={data} go={setPage} permissions={permissions} />}
                            {page === "vehicles" && <Vehicles data={data} query={search} openForm={(record) => openForm("vehicle", record)} remove={(record) => remove("vehicles", record, `${record.make} ${record.model}`)} />}
                            {page === "drivers" && <Drivers data={data} query={search} openForm={(record) => openForm("driver", record)} remove={(record) => remove("drivers", record, record.name)} />}
                            {page === "maintenance" && <Maintenance data={data} query={search} openForm={() => openForm("expense")} />}
                            {page === "finance" && <Finance data={data} query={search} openForm={openForm} />}
                            {page === "backup" && <Backup data={data} setError={setError} setMessage={setMessage} onImported={refresh} />}
                        </>
                </main>
            </div>

            <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone/80 bg-white/95 pb-[env(safe-area-inset-bottom)] pt-1 backdrop-blur lg:hidden">
                {visibleNav.filter((item) => item.id !== "drivers").slice(0, 5).map(({ id, label, icon: Icon }) => (
                    <button key={id} type="button" onClick={() => { setPage(id); setSearch(""); setError(""); setMessage(""); }} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium ${page === id ? "text-brand-700" : "text-ink/55"}`}><Icon size={19} /><span>{id === "maintenance" ? "Costs" : id === "finance" ? "Finance" : id === "backup" ? "More" : label}</span></button>
                ))}
            </nav>

            {formType && <RecordForm type={formType} record={editing} data={data} onClose={() => { setFormType(""); setEditing(null); }} onSave={(store, record, success) => persist(store, record, success)} />}
            <InstallPrompt />
        </div>
    );
}

function PageHeading({ eyebrow, title, description, action }) {
    return <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-ink/55">{eyebrow}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>{description && <p className="mt-1 text-sm text-ink/60">{description}</p>}</div>{action}</div>;
}

function Metric({ label, value, helper, dark = false }) {
    return <article className={`rounded-2xl border p-4 sm:p-5 ${dark ? "border-ink bg-ink text-white" : "border-stone/70 bg-white text-ink"}`}><p className={`text-xs font-semibold uppercase tracking-[0.13em] ${dark ? "text-white/60" : "text-ink/55"}`}>{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums sm:text-3xl">{value}</p>{helper && <p className={`mt-1 text-xs ${dark ? "text-white/55" : "text-ink/55"}`}>{helper}</p>}</article>;
}

function Card({ children, className = "" }) { return <section className={`rounded-2xl border border-stone/70 bg-white p-4 sm:p-5 ${className}`}>{children}</section>; }

function Dashboard({ data, go, permissions }) {
    const monthKey = dateToday().slice(0, 7);
    const expenses = data.expenses.filter((item) => item.date?.startsWith(monthKey)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const todayIncome = data.income.filter((item) => item.date === dateToday()).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const dueDocuments = data.vehicles.reduce((count, vehicle) => count + [vehicle.insuranceExpiry, vehicle.roadTaxExpiry, vehicle.roadworthyExpiry].filter((date) => { const days = daysUntil(date); return days !== null && days >= 0 && days <= 30; }).length, 0);
    const recent = [...data.vehicles].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")).slice(0, 5);
    const available = data.vehicles.filter((item) => item.status === "Available").length;
    const onHire = data.vehicles.filter((item) => item.status === "On hire").length;
    const underMaintenance = data.vehicles.filter((item) => item.status === "Maintenance").length;
    const canReadExpenses = permissions.has("finance.expenses.read");
    const canReadIncome = permissions.has("finance.income.read");
    const canReadRemittances = permissions.has("finance.remittances.read");
    const canReadOperations = permissions.has("fleet.operations.read");
    return <>
        <PageHeading eyebrow="Overview" title="Fleet dashboard" description="Your vehicles, records, and money at a glance." action={<button onClick={() => go("vehicles")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-black"><Plus size={17} />Add vehicle</button>} />
        <div role="status" className="flex gap-3 rounded-xl border border-stone bg-white px-4 py-3 text-sm leading-6 text-ink/70"><Check size={18} className="mt-0.5 shrink-0 text-brand-700" /><p><strong className="text-ink">Shared fleet connected.</strong> Authorized team members see the same saved records.</p></div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Vehicles" value={data.vehicles.length} helper={`${available} available · ${onHire} on hire`} dark /><Metric label="In maintenance" value={underMaintenance} helper="Vehicles marked for repair or service" />{canReadIncome && <Metric label="Income recorded today" value={formatMoney(todayIncome)} helper="Kept separate from remittances" />}{canReadExpenses && <Metric label="Vehicle costs this month" value={formatMoney(expenses)} helper={`${data.expenses.length} expense entries`} />}</div>
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className="!p-0"><div className="flex items-center justify-between border-b border-stone/70 px-4 py-4 sm:px-5"><div><h2 className="font-semibold">Vehicles</h2><p className="mt-1 text-xs text-ink/55">{dueDocuments ? `${dueDocuments} document${dueDocuments === 1 ? "" : "s"} due within 30 days` : "Your vehicle register"}</p></div><button onClick={() => go("vehicles")} className="text-sm font-semibold text-brand-700">View all</button></div>{recent.length ? <ul className="divide-y divide-stone/60">{recent.map((vehicle) => <li key={vehicle.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="min-w-0"><p className="truncate font-semibold">{vehicle.make} {vehicle.model}</p><p className="mt-0.5 text-sm text-ink/55">{vehicle.registration} · {vehicle.year || "Year not set"}</p></div><StatusPill value={vehicle.status || "Available"} /></li>)}</ul> : <Empty title="No vehicles added" body="Add your first car to start keeping the fleet register." action={<button onClick={() => go("vehicles")} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">Add vehicle</button>} />}</Card>
            <Card><h2 className="font-semibold">Quick actions</h2><div className="mt-4 grid gap-2"><QuickAction icon={CarFront} label="Add a vehicle" onClick={() => go("vehicles")} />{canReadOperations && <QuickAction icon={Users} label="Add a driver" onClick={() => go("drivers")} />}{canReadExpenses && <QuickAction icon={Wrench} label="Record a vehicle cost" onClick={() => go("maintenance")} />}{(canReadIncome || canReadRemittances) && <QuickAction icon={CircleDollarSign} label="Record income or remittance" onClick={() => go("finance")} />}</div></Card>
        </div>
    </>;
}

function QuickAction({ icon: Icon, label, onClick }) { return <button onClick={onClick} className="flex min-h-12 items-center gap-3 rounded-xl border border-stone/70 px-3 text-left text-sm font-medium hover:bg-canvas"><span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-white"><Icon size={17} /></span>{label}<ChevronRight size={16} className="ml-auto text-ink/45" /></button>; }
function Empty({ title, body, action }) { return <div className="px-5 py-10 text-center"><p className="font-semibold text-ink">{title}</p><p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-ink/60">{body}</p>{action}</div>; }
function StatusPill({ value }) { const tone = value === "Available" ? "bg-ink text-white" : value === "Maintenance" ? "bg-stone text-ink" : value === "On hire" ? "bg-brand-600 text-white" : "bg-canvas text-ink"; return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{value}</span>; }

function Vehicles({ data, query, openForm, remove }) {
    const [filter, setFilter] = useState("All");
    const records = data.vehicles.filter((vehicle) => `${vehicle.registration} ${vehicle.make} ${vehicle.model} ${vehicle.assignedDriver || ""}`.toLowerCase().includes(query.toLowerCase()) && (filter === "All" || vehicle.status === filter));
    return <><PageHeading eyebrow="Fleet register" title="Vehicles" description="Keep vehicle details and document dates in one place." action={<button onClick={() => openForm(null)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white"><Plus size={17} />Add vehicle</button>} />
        <div className="flex gap-2 overflow-x-auto pb-1">{["All", "Available", "On hire", "Maintenance", "Unavailable"].map((value) => <button key={value} onClick={() => setFilter(value)} className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold ${filter === value ? "border-ink bg-ink text-white" : "border-stone bg-white text-ink/65"}`}>{value}{value === "All" ? ` (${data.vehicles.length})` : ` (${data.vehicles.filter((vehicle) => vehicle.status === value).length})`}</button>)}</div>
        {records.length ? <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{records.map((vehicle) => <Card key={vehicle.id} className="!p-0"><div className="flex items-start justify-between gap-3 border-b border-stone/70 p-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">{vehicle.registration}</p><h2 className="mt-1 text-lg font-semibold">{vehicle.make} {vehicle.model}</h2><p className="mt-0.5 text-sm text-ink/60">{vehicle.year || "Year not set"}{vehicle.colour ? ` · ${vehicle.colour}` : ""}</p></div><StatusPill value={vehicle.status || "Available"} /></div><div className="grid grid-cols-2 gap-3 p-4 text-sm"><div><p className="text-xs text-ink/50">Assigned driver</p><p className="mt-1 font-medium">{vehicle.assignedDriver || "Not assigned"}</p></div><div><p className="text-xs text-ink/50">Next service</p><p className="mt-1 font-medium">{formatDate(vehicle.nextService)}</p></div><DocDate label="Insurance" date={vehicle.insuranceExpiry} /><DocDate label="Road tax" date={vehicle.roadTaxExpiry} /><DocDate label="Roadworthy" date={vehicle.roadworthyExpiry} /></div><div className="flex border-t border-stone/70 p-3"><button onClick={() => openForm(vehicle)} className="min-h-10 flex-1 rounded-lg text-sm font-semibold hover:bg-canvas">Edit vehicle</button><button onClick={() => remove(vehicle)} aria-label={`Delete ${vehicle.make} ${vehicle.model}`} className="grid min-h-10 w-10 place-items-center rounded-lg text-ink/45 hover:bg-brand-50 hover:text-brand-700"><Trash2 size={17} /></button></div></Card>)}</div> : <Card className="!p-0"><Empty title={query ? "No matching vehicles" : "No vehicles added yet"} body={query ? "Try another registration number or model." : "Add the cars in your hire fleet. You can edit the details later."} action={!query && <button onClick={() => openForm(null)} className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} className="mr-1 inline" /> Add first vehicle</button>} /></Card>}
    </>;
}

function DocDate({ label, date }) { const left = daysUntil(date); return <div><p className="text-xs text-ink/50">{label}</p><p className={`mt-1 font-medium ${left !== null && left <= 30 ? "text-brand-700" : "text-ink"}`}>{left === null ? "Not recorded" : `${formatDate(date)}${left <= 30 ? ` · ${left < 0 ? "expired" : `${left}d left`}` : ""}`}</p></div>; }

function Drivers({ data, query, openForm, remove }) {
    const records = data.drivers.filter((driver) => `${driver.name} ${driver.phone || ""} ${driver.licenceNumber || ""}`.toLowerCase().includes(query.toLowerCase()));
    return <><PageHeading eyebrow="People" title="Drivers" description="Driver profiles are managed by the owner or authorized staff. Drivers don’t sign in." action={<button onClick={() => openForm(null)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white"><Plus size={17} />Add driver</button>} />
        {records.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{records.map((driver) => { const active = data.vehicles.find((vehicle) => vehicle.assignedDriverId === driver.id); return <Card key={driver.id}><div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{driver.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><h2 className="font-semibold">{driver.name}</h2><p className="text-sm text-ink/55">{driver.phone || "No phone recorded"}</p></div></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${driver.active === false ? "bg-canvas text-ink/60" : "bg-ink text-white"}`}>{driver.active === false ? "Inactive" : "Active"}</span></div><div className="mt-4 border-t border-stone/70 pt-3 text-sm"><p className="text-xs text-ink/50">Assigned vehicle</p><p className="mt-1 font-medium">{active ? `${active.make} ${active.model} · ${active.registration}` : "No vehicle assigned"}</p><p className="mt-3 text-xs text-ink/50">Licence</p><p className="mt-1">{driver.licenceNumber || "Not recorded"}{driver.licenceExpiry ? ` · expires ${formatDate(driver.licenceExpiry)}` : ""}</p></div><div className="mt-3 flex border-t border-stone/70 pt-2"><button onClick={() => openForm(driver)} className="min-h-10 flex-1 rounded-lg text-sm font-semibold hover:bg-canvas">Edit</button><button onClick={() => remove(driver)} aria-label={`Delete ${driver.name}`} className="grid min-h-10 w-10 place-items-center rounded-lg text-ink/45 hover:text-brand-700"><Trash2 size={16} /></button></div></Card>; })}</div> : <Card className="!p-0"><Empty title="No drivers added yet" body="Add a driver profile, then assign them to a vehicle." action={!query && <button onClick={() => openForm(null)} className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">Add first driver</button>} /></Card>}
    </>;
}

function Maintenance({ data, query, openForm }) {
    const monthKey = dateToday().slice(0, 7);
    const monthEntries = data.expenses.filter((item) => item.date?.startsWith(monthKey));
    const monthTotal = monthEntries.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const groups = Object.entries(data.expenses.reduce((totals, item) => { totals[item.category] = (totals[item.category] || 0) + Number(item.amount || 0); return totals; }, {})).sort((a, b) => b[1] - a[1]);
    const records = [...data.expenses].filter((item) => `${item.item} ${item.vehicleName} ${item.category} ${item.supplier || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    const byVehicle = data.vehicles.map((vehicle) => ({ vehicle, total: data.expenses.filter((item) => item.vehicleId === vehicle.id).reduce((sum, item) => sum + Number(item.amount || 0), 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
    return <><PageHeading eyebrow="Maintenance" title="Vehicle spending" description="Record and review repair, service, and parts costs by vehicle." action={<button onClick={openForm} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white"><Plus size={17} />Add expense</button>} />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="This month" value={formatMoney(monthTotal)} helper={`${monthEntries.length} entries this month`} dark /><Metric label="All recorded costs" value={formatMoney(data.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))} helper="Since records began" /><Metric label="Vehicles with costs" value={byVehicle.length} helper="Vehicles with at least one entry" /><Metric label="Expense entries" value={data.expenses.length} helper="Maintenance and vehicle requirements" /></div>
        <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <Card className="!p-0"><div className="border-b border-stone/70 px-4 py-4 sm:px-5"><h2 className="font-semibold">Expense history</h2><p className="mt-1 text-sm text-ink/55">Itemized vehicle costs, newest first</p></div>{records.length ? <ul className="divide-y divide-stone/60">{records.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="min-w-0"><p className="truncate font-semibold">{item.item}</p><p className="mt-0.5 truncate text-sm text-ink/60">{item.vehicleName} · {item.category}</p><p className="mt-1 text-xs text-ink/50">{formatDate(item.date)}{item.supplier ? ` · ${item.supplier}` : ""} · Qty {item.quantity}</p></div><span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums"><ArrowDownRight size={16} className="text-brand-700" />{formatMoney(item.amount)}</span></li>)}</ul> : <Empty title="No vehicle costs recorded" body="Add a battery, engine oil, tyres, filters, repair, service, or other car requirement." action={!query && data.vehicles.length > 0 && <button onClick={openForm} className="mt-4 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">Record first expense</button>} />}</Card>
            <div className="space-y-4"><Card><h2 className="font-semibold">Spend by category</h2><p className="mt-1 text-sm text-ink/55">Lifetime recorded totals</p>{groups.length ? <ul className="mt-4 space-y-4">{groups.map(([category, amount]) => <li key={category}><div className="flex justify-between gap-3 text-sm"><span>{category}</span><span className="font-semibold tabular-nums">{formatMoney(amount)}</span></div><div className="mt-2 h-1.5 rounded-full bg-stone/50"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(3, amount / Math.max(1, data.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0)) * 100)}%` }} /></div></li>)}</ul> : <p className="mt-4 text-sm text-ink/55">Category totals will show after you record expenses.</p>}</Card>
                <Card><h2 className="font-semibold">Total by vehicle</h2>{byVehicle.length ? <ul className="mt-3 divide-y divide-stone/60">{byVehicle.map(({ vehicle, total }) => <li key={vehicle.id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">{vehicle.make} {vehicle.model} <span className="text-ink/50">· {vehicle.registration}</span></span><span className="shrink-0 font-semibold tabular-nums">{formatMoney(total)}</span></li>)}</ul> : <p className="mt-3 text-sm text-ink/55">Vehicle totals will show here.</p>}</Card>
            </div>
        </div>
    </>;
}

function Finance({ data, query, openForm }) {
    const earnings = data.income.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paidIn = data.remittances.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const incomes = [...data.income].filter((item) => `${item.driverName} ${item.vehicleName} ${item.note || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    const remittances = [...data.remittances].filter((item) => `${item.driverName} ${item.vehicleName} ${item.note || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
    return <><PageHeading eyebrow="Finance" title="Income & remittances" description="Keep income recorded and money received from drivers as separate records." /><div className="grid gap-3 sm:grid-cols-2"><Metric label="Income recorded" value={formatMoney(earnings)} helper={`${data.income.length} income entries`} dark /><Metric label="Driver remittances recorded" value={formatMoney(paidIn)} helper={`${data.remittances.length} payments entered`} /></div>
        <div className="grid gap-4 xl:grid-cols-2"><Card className="!p-0"><div className="flex items-center justify-between gap-3 border-b border-stone/70 px-4 py-4"><div><h2 className="font-semibold">Income</h2><p className="mt-1 text-sm text-ink/55">Business earnings entered by staff</p></div><button onClick={() => openForm("income")} className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white" aria-label="Record income"><Plus size={18} /></button></div>{incomes.length ? <ul className="divide-y divide-stone/60">{incomes.map((item) => <li key={item.id} className="flex justify-between gap-3 px-4 py-3.5"><div><p className="font-medium">{item.driverName || "Driver not specified"}</p><p className="mt-0.5 text-sm text-ink/55">{item.vehicleName || "Vehicle not specified"} · {formatDate(item.date)}</p></div><p className="flex items-center gap-1 font-semibold"><ArrowUpRight size={15} />{formatMoney(item.amount)}</p></li>)}</ul> : <Empty title="No income recorded" body="Add income when the business receives or records earnings." action={<button onClick={() => openForm("income")} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">Record income</button>} />}</Card>
            <Card className="!p-0"><div className="flex items-center justify-between gap-3 border-b border-stone/70 px-4 py-4"><div><h2 className="font-semibold">Driver remittances</h2><p className="mt-1 text-sm text-ink/55">Money received from drivers</p></div><button onClick={() => openForm("remittance")} className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-white" aria-label="Record remittance"><Plus size={18} /></button></div>{remittances.length ? <ul className="divide-y divide-stone/60">{remittances.map((item) => <li key={item.id} className="flex justify-between gap-3 px-4 py-3.5"><div><p className="font-medium">{item.driverName || "Driver not specified"}</p><p className="mt-0.5 text-sm text-ink/55">{item.vehicleName || "Vehicle not specified"} · {formatDate(item.date)}</p></div><p className="flex items-center gap-1 font-semibold"><ArrowDownRight size={15} className="text-brand-700" />{formatMoney(item.amount)}</p></li>)}</ul> : <Empty title="No remittances recorded" body="Enter a payment after it has been received. Income and remittances are not automatically balanced." action={<button onClick={() => openForm("remittance")} className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white">Record remittance</button>} />}</Card>
        </div>
        <p className="rounded-xl border border-stone bg-white px-4 py-3 text-sm leading-6 text-ink/65">Income and remittances are displayed separately. This version does not calculate a driver balance or impose a settlement schedule.</p>
    </>;
}

function Backup({ data, setError, setMessage, onImported }) {
    const [working, setWorking] = useState(false);
    const download = async () => {
        setWorking(true); setError("");
        try { const backup = { format: "ip-motors-shared-export", version: 1, exportedAt: new Date().toISOString(), data }; const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `ip-motors-export-${dateToday()}.json`; link.click(); URL.revokeObjectURL(url); setMessage("Fleet export downloaded. Keep it somewhere safe."); }
        catch (problem) { setError(problem?.message || "Could not create a backup."); }
        finally { setWorking(false); }
    };
    return <><PageHeading eyebrow="Account & data" title="Backup & settings" description="Export a copy of the shared fleet records or import vehicles in bulk." /><Card className="max-w-3xl"><span className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-white"><FileText size={20} /></span><h2 className="mt-4 text-lg font-semibold">Shared fleet export</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">These records are loaded from the protected fleet database and shared with authorized team members. Download an export whenever you need an additional offline copy.</p><div className="mt-5"><button disabled={working} onClick={download} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"><Download size={17} />Download fleet export</button></div><div className="mt-6 flex items-start gap-3 rounded-xl bg-canvas p-4 text-sm leading-6 text-ink/65"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-brand-700" /><p>Only authorized accounts can open or change this fleet. Sign out before handing your phone to someone else.</p></div></Card><VehicleImport data={data} onImported={onImported} setError={setError} setMessage={setMessage} /></>;
}

function RecordForm({ type, record, data, onClose, onSave }) {
    const isEdit = Boolean(record);
    const [values, setValues] = useState(() => initialValues(type, record));
    const [formError, setFormError] = useState("");
    const update = (key, value) => setValues((current) => ({ ...current, [key]: value }));
    const title = ({ vehicle: isEdit ? "Edit vehicle" : "Add vehicle", driver: isEdit ? "Edit driver" : "Add driver", expense: "Record vehicle expense", income: "Record income", remittance: "Record driver remittance" })[type];
    const store = ({ vehicle: "vehicles", driver: "drivers", expense: "expenses", income: "income", remittance: "remittances" })[type];
    const submit = (event) => {
        event.preventDefault(); setFormError("");
        const amount = Number(values.amount);
        if (type === "vehicle" && (!values.registration.trim() || !values.make.trim() || !values.model.trim())) return setFormError("Enter the registration, make, and model.");
        if (type === "vehicle" && data.vehicles.some((vehicle) => vehicle.id !== record?.id && vehicle.registration?.trim().toLowerCase() === values.registration.trim().toLowerCase())) return setFormError("A vehicle with this registration is already recorded.");
        if (type === "driver" && !values.name.trim()) return setFormError("Enter the driver’s name.");
        if (type === "expense" && (!values.vehicleId || !values.item.trim() || !Number.isFinite(amount) || amount <= 0)) return setFormError("Choose a vehicle, enter the item, and enter a cost greater than zero.");
        if ((type === "income" || type === "remittance") && (!Number.isFinite(amount) || amount <= 0)) return setFormError("Enter an amount greater than zero.");
        if (type === "remittance" && !values.driverId) return setFormError("Choose the driver who made this remittance.");
        const vehicle = data.vehicles.find((item) => item.id === values.vehicleId);
        const driver = data.drivers.find((item) => item.id === values.driverId);
        const payload = { ...values, ...(record?.id ? { id: record.id } : {}) };
        if (type === "vehicle") Object.assign(payload, { registration: values.registration.trim().toUpperCase(), make: values.make.trim(), model: values.model.trim(), year: values.year ? Number(values.year) : "", assignedDriver: data.drivers.find((item) => item.id === values.assignedDriverId)?.name || "" });
        if (type === "driver") Object.assign(payload, { name: values.name.trim(), active: values.active === true || values.active === "true" });
        if (type === "expense" || type === "income" || type === "remittance") Object.assign(payload, { amount, vehicleName: vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.registration}` : values.vehicleName || "", driverName: driver?.name || values.driverName || "" });
        if (type === "expense") Object.assign(payload, { item: values.item.trim(), quantity: Number(values.quantity || 1), supplier: values.supplier.trim() });
        onSave(store, payload, `${title.replace(/^(Add|Edit|Record) /, "")} saved.`);
    };
    const field = (key, label, options = {}) => <label className={`block space-y-1.5 text-sm font-medium text-ink ${options.className || ""}`}>{label}{options.select ? <select required={options.required} value={values[key] ?? ""} onChange={(event) => update(key, event.target.value)} className="app-input"><option value="">{options.placeholder || "Select…"}</option>{options.select.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select> : <input required={options.required} type={options.type || "text"} min={options.min} step={options.step} placeholder={options.placeholder} value={values[key] ?? ""} onChange={(event) => update(key, event.target.value)} className="app-input" />}</label>;

    return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div role="dialog" aria-modal="true" aria-labelledby="record-form-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/55">IP Motors</p><h2 id="record-form-title" className="mt-1 text-xl font-semibold">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close form" className="rounded-lg p-2 hover:bg-stone/50"><X size={19} /></button></div><form onSubmit={submit} className="space-y-4">
        {type === "vehicle" && <div className="grid gap-4 sm:grid-cols-2">{field("registration", "Registration number", { required: true, placeholder: "e.g. BAA 1234" })}{field("make", "Make", { required: true, placeholder: "Toyota" })}{field("model", "Model", { required: true, placeholder: "Mark X" })}{field("year", "Year", { type: "number", min: "1950", placeholder: "2020" })}{field("colour", "Colour", { placeholder: "Black" })}{field("status", "Status", { select: ["Available", "On hire", "Maintenance", "Unavailable"].map((value) => ({ label: value, value })) })}{field("assignedDriverId", "Assigned driver", { select: data.drivers.map((driver) => ({ label: driver.name, value: driver.id })), placeholder: "No driver assigned" })}{field("insuranceExpiry", "Insurance expiry", { type: "date" })}{field("roadTaxExpiry", "Road tax expiry", { type: "date" })}{field("roadworthyExpiry", "Roadworthy expiry", { type: "date" })}{field("nextService", "Next service date", { type: "date" })}<label className="space-y-1.5 text-sm font-medium sm:col-span-2">Notes<textarea value={values.notes || ""} onChange={(event) => update("notes", event.target.value)} className="app-input min-h-24" placeholder="Optional vehicle notes" /></label></div>}
        {type === "driver" && <div className="grid gap-4 sm:grid-cols-2">{field("name", "Full name", { required: true, placeholder: "Driver name" })}{field("phone", "Phone", { placeholder: "+260…" })}{field("licenceNumber", "Licence number", { placeholder: "Optional" })}{field("licenceExpiry", "Licence expiry", { type: "date" })}{field("active", "Status", { select: [{ label: "Active", value: "true" }, { label: "Inactive", value: "false" }] })}</div>}
        {type === "expense" && <div className="grid gap-4 sm:grid-cols-2">{field("vehicleId", "Vehicle", { required: true, select: data.vehicles.map((vehicle) => ({ label: `${vehicle.make} ${vehicle.model} · ${vehicle.registration}`, value: vehicle.id })), placeholder: "Choose vehicle" })}{field("item", "Item or work", { required: true, placeholder: "Battery replacement" })}{field("category", "Category", { select: CATEGORIES.map((value) => ({ label: value, value })) })}{field("date", "Date", { required: true, type: "date" })}{field("quantity", "Quantity", { type: "number", min: "0.01", step: "any" })}{field("amount", "Total cost (ZMW)", { required: true, type: "number", min: "0.01", step: "0.01", placeholder: "0.00" })}{field("supplier", "Supplier or workshop", { placeholder: "Optional" })}{field("paymentMethod", "Payment method", { select: ["Cash", "Mobile money", "Bank transfer", "Card", "Other"].map((value) => ({ label: value, value })) })}</div>}
        {(type === "income" || type === "remittance") && <div className="grid gap-4 sm:grid-cols-2">{field("driverId", "Driver", { select: data.drivers.map((driver) => ({ label: driver.name, value: driver.id })), placeholder: "Not specified" })}{field("vehicleId", "Vehicle", { select: data.vehicles.map((vehicle) => ({ label: `${vehicle.make} ${vehicle.model} · ${vehicle.registration}`, value: vehicle.id })), placeholder: "Not specified" })}{field("date", "Date", { required: true, type: "date" })}{field("amount", "Amount (ZMW)", { required: true, type: "number", min: "0.01", step: "0.01", placeholder: "0.00" })}{field("paymentMethod", "Payment method", { select: ["Cash", "Mobile money", "Bank transfer", "Card", "Other"].map((value) => ({ label: value, value })) })}<label className="space-y-1.5 text-sm font-medium">Note<input value={values.note || ""} onChange={(event) => update("note", event.target.value)} className="app-input" placeholder="Optional details" /></label></div>}
        {formError && <p role="alert" className="rounded-lg border border-brand-500/30 bg-white px-3 py-2 text-sm text-brand-800">{formError}</p>}
        <div className="flex justify-end gap-2 border-t border-stone/70 pt-4"><button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-ink/65 hover:bg-stone/40">Cancel</button><button type="submit" className="min-h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white hover:bg-black">Save</button></div>
    </form></div></div>;
}

function initialValues(type, record) {
    if (record) return { ...record, quantity: String(record.quantity ?? 1), amount: String(record.amount ?? ""), active: String(record.active !== false) };
    const base = { date: dateToday(), quantity: "1", amount: "", category: CATEGORIES[0], paymentMethod: "Cash", status: "Available", active: "true" };
    return base;
}

export default App;
