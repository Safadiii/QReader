"use client";

import { useCallback, useState } from "react";
import { PhoneField } from "@/components/login/PhoneField";
import "@/components/login/login.css";
import { deviceSecret, rememberDevice } from "@/lib/device";
import { RestoreCard } from "./RestoreCard";
import type { CardState } from "./StampCard";
import "./savestamps.css";

const ERR: Record<string, [string, string]> = {
  wrong_pin: ["PIN yanlış.", "Wrong PIN."],
  locked: ["Çok fazla yanlış deneme. 15 dakika bekleyin.", "Too many wrong tries. Wait 15 minutes."],
  card_has_phone: ["Bu kart başka bir numaraya kayıtlı.", "This card is already saved to another number."],
  invalid: ["Numarayı ve 4 haneli PIN'i kontrol edin.", "Check the number and the 4-digit PIN."],
  slow: ["Çok fazla deneme. Biraz bekleyin.", "Too many tries. Wait a moment."],
  try_again: ["Tekrar deneyin.", "Try again."],
  unavailable: ["Şu an ulaşılamıyor.", "Can't reach the cafe right now."],
};

/**
 * Keeps the stamps with the customer, not the phone: a phone number and a 4-digit PIN. The first
 * time it saves the card to that number; after that, the same number and PIN bring the stamps
 * to any phone.
 */
export function SaveStamps({
  token,
  lang,
  card,
  onDone,
}: {
  token: string;
  lang: "tr" | "en";
  card: CardState;
  onDone: (card: CardState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [byCode, setByCode] = useState(false);
  const [phone, setPhone] = useState("");
  const onPhone = useCallback((value: string) => setPhone(value), []);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const say = (tr: string, en: string) => (lang === "tr" ? tr : en);
  const fresh = card.stamps === 0 && card.pending === 0 && card.rewards_redeemed === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(token)}/loyalty/phone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceSecret(), phone, pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.enabled) {
        if (body.device) rememberDevice(body.device);
        onDone(body);
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
      <button type="button" className="sv-open" onClick={() => setOpen(true)}>
        {fresh
          ? say("Daha önce damga topladınız mı? Giriş yapın", "Collected stamps before? Sign in")
          : say("Damgalarınızı telefon numaranıza kaydedin", "Save your stamps to your phone number")}
      </button>
    );
  }

  if (byCode) {
    return (
      <div className="sv-form">
        <RestoreCard token={token} lang={lang} onRestored={onDone} startOpen />
        <button type="button" className="sv-switch" onClick={() => setByCode(false)}>
          {say("Telefon numarası ile devam et", "Use my phone number instead")}
        </button>
      </div>
    );
  }

  return (
    <form className="sv-form" onSubmit={(e) => void submit(e)}>
      <div className="sv-title">{say("Damgalarınız her telefonda sizinle", "Keep your stamps on any phone")}</div>
      <p className="sv-help">
        {say(
          "İlk kez mi? 4 haneli bir PIN seçin. Daha önce kaydettiyseniz PIN'inizi yazın.",
          "First time? Choose a 4-digit PIN. Saved before? Enter your PIN.",
        )}
      </p>

      <PhoneField label={say("Telefon", "Phone")} onChange={onPhone} />

      <label className="lg-field">
        <span>PIN</span>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          aria-label="PIN"
        />
      </label>

      {error && (
        <p className="sv-error" role="alert">
          {ERR[error][lang === "tr" ? 0 : 1]}
        </p>
      )}

      <button className="sv-go" type="submit" disabled={busy || !/^\+\d{8,15}$/.test(phone) || pin.length !== 4}>
        {say("Kaydet", "Save")}
      </button>
      <button type="button" className="sv-switch" onClick={() => setByCode(true)}>
        {say("Kart kodumu kullanayım", "Use my card code instead")}
      </button>
    </form>
  );
}
