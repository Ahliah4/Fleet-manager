"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth/client";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode, returnTo }: { mode: Mode; returnTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isSignUp = mode === "sign-up";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const result = isSignUp
      ? await authClient.signUp.email({
          name: String(form.get("name") ?? "").trim(),
          email,
          password,
        })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setMessage("We could not complete that request. Check your details and try again.");
      setBusy(false);
      return;
    }
    router.replace(returnTo === "/mobile/authorize" ? returnTo : "/auth/complete");
    router.refresh();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setMessage(null);
    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}${returnTo === "/mobile/authorize" ? returnTo : "/auth/complete"}`,
    });
    if (result.error) {
      setMessage("Google sign-in could not be started. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <div className="brand" aria-label="Fleet Operations">
          <div className="mark">IP</div>
          <span>FLEET OPERATIONS</span>
        </div>
        <h1>{isSignUp ? "Create your account" : "Sign in to your fleet"}</h1>
        <p className="intro">
          {isSignUp
            ? "Use your work email. Fleet access is assigned by an owner."
            : "Manage vehicles, compliance and hires in one place."}
        </p>
        <form onSubmit={submit}>
          {isSignUp && <label>Full name<input name="name" autoComplete="name" required /></label>}
          <label>Email address<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required /></label>
          {message && <p className="error" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}</button>
        </form>
        <div className="divider">or</div>
        <button className="google" type="button" onClick={signInWithGoogle} disabled={busy}>Continue with Google</button>
        {!isSignUp && (
          <p className="switch recovery">
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </p>
        )}
        <p className="switch">{isSignUp ? "Already have an account?" : "New here?"} <Link href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"}>{isSignUp ? "Sign in" : "Create an account"}</Link></p>
      </section>
    </main>
  );
}
