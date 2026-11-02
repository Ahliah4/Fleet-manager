"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (result.error) {
      setError("We could not start password recovery. Check the email and try again.");
      setBusy(false);
      return;
    }
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="brand" aria-label="Fleet Operations">
          <div className="mark">IP</div>
          <span>FLEET OPERATIONS</span>
        </div>
        <h1>Reset your password</h1>
        <p className="intro">
          Enter your account email and we will send a secure reset link.
        </p>
        {sent ? (
          <>
            <p className="success" role="status">
              If an account exists for that email, a reset link is on its way.
              Check your inbox and spam folder.
            </p>
            <p className="switch"><Link href="/auth/sign-in">Back to sign in</Link></p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Please wait…" : "Send reset link"}
            </button>
            <p className="switch"><Link href="/auth/sign-in">Back to sign in</Link></p>
          </form>
        )}
      </section>
    </main>
  );
}
