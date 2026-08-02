import { BellRing, ShieldCheck, UserRound } from "lucide-react";

import Button from "../Components/Button";
import Card from "../Components/Card";
import { useAuth } from "../lib/authContext";

function SettingToggle({ label, description, checked = false }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-5 rounded-xl px-1 py-3 transition hover:bg-slate-50">
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-1 block text-sm text-slate-500">{description}</span>
      </span>
      <input aria-label={label} type="checkbox" defaultChecked={checked} className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
    </label>
  );
}

function Settings() {
  const { user } = useAuth();
  const name = user?.user_metadata?.full_name || "";

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-description">Manage your account preferences and fleet notifications.</p>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600"><UserRound size={20} /></div>
          <div><h2 className="text-lg font-semibold text-slate-950">Profile</h2><p className="mt-1 text-sm text-slate-500">Your account details are managed securely through Supabase.</p></div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Full name</span><input className="app-input" defaultValue={name} placeholder="Your name" /></label>
          <label><span className="mb-1.5 block text-sm font-medium text-slate-700">Email address</span><input className="app-input bg-slate-50 text-slate-500" defaultValue={user?.email || ""} readOnly /></label>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-start gap-3"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-600"><BellRing size={20} /></div><div><h2 className="text-lg font-semibold text-slate-950">Notifications</h2><p className="mt-1 text-sm text-slate-500">Choose which activity needs your attention.</p></div></div>
          <div className="mt-5 divide-y divide-slate-100"><SettingToggle label="Email notifications" description="Receive important fleet updates by email." /><SettingToggle label="Document expiry alerts" description="Be alerted when documents are due or expired." checked /></div>
        </Card>
        <Card>
          <div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600"><ShieldCheck size={20} /></div><div><h2 className="text-lg font-semibold text-slate-950">Fleet preferences</h2><p className="mt-1 text-sm text-slate-500">Keep compliance checks aligned with your workflow.</p></div></div>
          <div className="mt-5 divide-y divide-slate-100"><SettingToggle label="30-day expiry window" description="Flag documents expiring within 30 days." checked /><SettingToggle label="Maintenance reminders" description="Show maintenance-related reminders in notifications." checked /></div>
        </Card>
      </div>

      <div className="flex justify-end"><Button>Save preferences</Button></div>
    </section>
  );
}

export default Settings;
