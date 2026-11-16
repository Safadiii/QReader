"use client";

import { useState } from "react";
import { deviceSecret, rememberDevice } from "@/lib/device";
import type { CardState } from "./StampCard";
import "./restorecard.css";

const ERR: Record<string, [string, string]> = {
  not_found: ["Bu kodla kart bulunamadı.", "No card with that code."],
  slow: ["Çok fazla deneme. Biraz bekleyin.", "Too many tries. Wait a moment."],
  unavailable: ["Şu an ulaşılamıyor.", "Can't reach the cafe right now."],
  invalid: ["Kodu kontrol edin.", "Check the code."],
};

/** For a phone that lost its card: type the card's code and the stamps come back. */
export function RestoreCard({
  token,
  lang,
  onRestored,
  startOpen = false,
}: {
  token: string;
  lang: "tr" | "en";
  onRestored: (card: CardState) => void;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (tr: string, en: string) => (lang === "tr" ? tr : en);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(token)}/loyalty/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceSecret(), code }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.enabled) {
        if (body.device) rememberDevice(body.device);
        onRestored(body);
        return;
      }
      setError(body.error in ERR ? body.error : "unavailable");
    } catch {
      setError("unavailable");
    }
    setBusy(false);
  };

  if (!open) {
    return (
      <button type="button" className="rs-link" onClick={() => setOpen(true)}>
        {say("Daha önce kartınız var mı?", "Already have a card?")}
      </button>
    );
  }

  return (
    <form className="rs-form" onSubmit={(e) => void submit(e)}>
      <label htmlFor="rs-code">{say("Eski kart kodunuz", "Your old card code")}</label>
      <div className="rs-row">
        <input
          id="rs-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7F2-9QXM"
          maxLength={9}
          autoComplete="off"
          autoFocus
        />
        <button type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 8}>
          {say("Getir", "Restore")}
        </button>
      </div>
      {error && (
        <p role="alert">
          {ERR[error][lang === "tr" ? 0 : 1]}
        </p>
      )}
    </form>
  );
}
