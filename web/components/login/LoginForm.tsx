"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import "./login.css";
import { reloadTo } from "@/lib/navigate";

/** Only ever send people to a page on this site after sign-in. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        // A full page load, so every screen starts with the new session.
        reloadTo(next);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not sign in.");
    } catch {
      setError("Can't reach the server. Try again.");
    }
    setBusy(false);
  };

  return (
    <main className="lg-page">
      <form className="lg-card" onSubmit={(e) => void submit(e)}>
        <h1 className="lg-brand">QReader</h1>
        <p className="lg-sub">Personel girişi · Staff sign-in</p>

        <label className="lg-field">
          <span>E-posta · Email</span>
          <input name="email" type="email" autoComplete="username" required autoFocus />
        </label>
        <label className="lg-field">
          <span>Şifre · Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {error && (
          <p className="lg-error" role="alert">
            {error}
          </p>
        )}

        <button className="lg-submit" type="submit" disabled={busy}>
          {busy ? "…" : "Giriş yap · Sign in"}
        </button>
      </form>
    </main>
  );
}
