"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthBrand } from "./brand";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode, returnTo }: { mode: Mode; returnTo?: string }) {
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const payload = isSignUp
        ? { name: String(form.get("name") ?? "").trim(), email, password }
        : { email, password };
      const response = await fetch(
        isSignUp ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        setMessage(
          response.status === 401
            ? "The email or password is incorrect. Use Forgot password to reset it."
            : "Sign-in is temporarily unavailable. Please try again.",
        );
        return;
      }

      window.location.assign(returnTo === "/mobile/authorize" ? returnTo : "/auth/complete");
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "AbortError"
          ? "Sign-in timed out. Check your connection and try again."
          : "The sign-in request could not be completed. Please try again.",
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <AuthBrand />
        <p className="eyebrow">Secure fleet access</p>
        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p className="intro">
          {isSignUp
            ? "Create your sign-in, then ask the Fleet Owner to grant access."
            : "Sign in to IP Motors Fleet Manager to open the shared fleet."}
        </p>
        <form onSubmit={submit}>
          {isSignUp && <label>Full name<input name="name" autoComplete="name" required /></label>}
          <label>Email address<input name="email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete={isSignUp ? "new-password" : "current-password"} minLength={8} required /></label>
          {message && <p className="error" role="alert">{message}</p>}
          <button type="submit" disabled={busy}>{busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}</button>
        </form>
        {!isSignUp && (
          <p className="switch recovery">
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </p>
        )}
        <p className="switch">{isSignUp ? "Already registered?" : "Need an account?"} <Link href={isSignUp ? "/auth/sign-in" : "/auth/sign-up"}>{isSignUp ? "Sign in" : "Create one"}</Link></p>
        <p className="privacy-note">Only authorized IP Motors fleet members can access fleet records.</p>
      </section>
    </main>
  );
}
