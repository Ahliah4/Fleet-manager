"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : "This password reset link is missing or expired.",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword: password, token });
    if (result.error) {
      setError("We could not update the password. Request a new reset link and try again.");
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
  }

  if (done) {
    return (
      <>
        <p className="success" role="status">Your password was updated.</p>
        <p className="switch"><Link href="/auth/sign-in">Continue to sign in</Link></p>
      </>
    );
  }

  return (
    <form onSubmit={submit}>
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !token}>
        {busy ? "Please wait…" : "Update password"}
      </button>
      <p className="switch"><Link href="/auth/sign-in">Back to sign in</Link></p>
    </form>
  );
}
