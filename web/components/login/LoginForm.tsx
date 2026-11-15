"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import "./login.css";
import { reloadTo } from "@/lib/navigate";
import { PhoneField } from "./PhoneField";

/** Only ever send people to a page on this site after sign-in. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}

export function LoginForm({ initial = "signin" }: { initial?: "signin" | "signup" }) {
  const next = safeNext(useSearchParams().get("next"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(initial);
  const [phone, setPhone] = useState("");
  const onPhone = useCallback((value: string) => setPhone(value), []);
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(signup ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signup
            ? {
                storeName: form.get("storeName"),
                name: form.get("name"),
                phone,
                password: form.get("password"),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }
            : { phone, password: form.get("password") },
        ),
      });
      if (res.ok) {
        // A full page load, so every screen starts with the new session.
        reloadTo(next);
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? (signup ? "Could not sign up." : "Could not sign in."));
    } catch {
      setError("Can't reach the server. Try again.");
    }
    setBusy(false);
  };

  return (
    <main className="lg-page">
      <form className="lg-card" key="f" onSubmit={(e) => void submit(e)}>
        <h1 className="lg-brand">QReader</h1>
        <div className="lg-tabs" role="tablist">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "signin" ? "Giriş · Sign in" : "Kayıt · Sign up"}
            </button>
          ))}
        </div>

        {signup && (
          <>
            <label className="lg-field">
              <span>İşletme adı · Business name</span>
              <input name="storeName" autoComplete="organization" required maxLength={150} />
            </label>
            <label className="lg-field">
              <span>Adınız · Your name</span>
              <input name="name" autoComplete="name" required maxLength={150} />
            </label>
          </>
        )}
        <PhoneField key={mode} label="Telefon · Phone" onChange={onPhone} autoFocus={!signup} />
        <label className="lg-field">
          <span>Şifre · Password{signup ? " (10+)" : ""}</span>
          <input
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 10 : undefined}
            required
          />
        </label>

        {error && (
          <p className="lg-error" role="alert">
            {error}
          </p>
        )}

        <button className="lg-submit" type="submit" disabled={busy}>
          {busy ? "…" : signup ? "Hesap oluştur · Create account" : "Giriş yap · Sign in"}
        </button>
      </form>
    </main>
  );
}
