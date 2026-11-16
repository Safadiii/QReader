"use client";

import { useState } from "react";
import { reloadTo } from "@/lib/navigate";
import "./join.css";

const ERR: Record<string, [string, string]> = {
  not_found: [
    "Bu numarayı bulamadık. Fişinizdeki numarayı kontrol edin.",
    "We can't find that order. Check the number on your receipt.",
  ],
  number: ["Sipariş numarasını yazın.", "Enter your order number."],
  slow: ["Çok fazla deneme. Biraz bekleyin.", "Too many tries. Wait a moment."],
  unavailable: ["Şu an ulaşılamıyor. Tekrar deneyin.", "Can't reach the shop right now. Try again."],
};

/** The page behind the printed QR: the customer types their order number to get buzzed. */
export function JoinForm({ token, store, valid }: { token: string; store: string; valid: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: Number(value) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.path === "string") {
        reloadTo(body.path);
        return;
      }
      setError(body.error in ERR ? body.error : "unavailable");
    } catch {
      setError("unavailable");
    }
    setBusy(false);
  };

  if (!valid) {
    return (
      <main className="jn-page">
        <div className="jn-card">
          <h1 className="jn-title">Geçersiz QR · Invalid QR</h1>
          <p className="jn-sub">Bu kod artık geçerli değil. · This code is no longer valid.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="jn-page">
      <form className="jn-card" onSubmit={(e) => void submit(e)}>
        {store && <div className="jn-store">{store}</div>}
        <h1 className="jn-title">Sipariş numaranız?</h1>
        <p className="jn-sub">What&apos;s your order number?</p>

        <label className="jn-label" htmlFor="jn-number">
          Fişteki numara · Number on your receipt
        </label>
        <input
          id="jn-number"
          className="jn-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          required
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 5))}
        />

        {error && (
          <p className="jn-error" role="alert">
            {ERR[error][0]}
            <span>{ERR[error][1]}</span>
          </p>
        )}

        <button className="jn-go" type="submit" disabled={busy || value === ""}>
          Haber ver · Notify me
        </button>
        <p className="jn-note">Siparişiniz hazır olunca telefonunuz çalacak. · Your phone will ring when it&apos;s ready.</p>
      </form>
    </main>
  );
}
