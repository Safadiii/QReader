"use client";

import { useState } from "react";
import "./carform.css";
import { CarDetails } from "./CarDetails";
import { PlateInput } from "./TurkishPlate";
import { isValidPlate } from "./plate";

const L = {
  title: "Arabaya servis · Bring it to my car",
  sub: "Siparişinizi yazın, plakanızı girin; arabanıza getirelim. · Tell us what you'd like and where your car is.",
  have: "Kafede sipariş verdim · I already ordered at the café",
  num: "Sipariş numaranız · Your order number",
  what: "Ne istiyorsunuz? · What would you like?",
  whatPh: "2 latte, 1 cheesecake…",
  plate: "Araç plakanız · Your car's plate",
  name: "Adınız (isteğe bağlı) · Your name (optional)",
  pay: "Ödeme kafede/araçta yapılır. · You pay at the café.",
  send: "Gönder · Send to the café",
  sending: "Gönderiliyor… · Sending…",
  fail: "Gönderilemedi. · Couldn't send.",
  closed: "Şu an arabaya servis yok. · The café isn't serving to cars right now.",
  menu: "Menüye bak · See the menu",
};

export function CarForm({ token, store, available, menuHref }: { token: string; store: string; available: boolean; menuHref: string | null }) {
  const [has, setHas] = useState(false);
  const [num, setNum] = useState("");
  const [what, setWhat] = useState("");
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [car, setCar] = useState({ color: "", model: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = isValidPlate(plate) && (has ? /^\d{1,5}$/.test(num) : what.trim().length > 0);

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/car/${encodeURIComponent(token)}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_number: has ? Number(num) : null,
          what,
          customer_name: name,
          car_plate: plate,
          car_color: car.color,
          car_model: car.model,
          car_note: car.note,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : L.fail);
      window.location.href = `/track/${encodeURIComponent(body.token)}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : L.fail);
      setBusy(false);
    }
  };

  return (
    <div className="cf">
      <header>
        <p className="cf-store">{store}</p>
        <h1>{L.title}</h1>
        <p>{L.sub}</p>
      </header>

      {!available ? (
        <p className="cf-closed">{L.closed}</p>
      ) : (
        <>
          <label className="cf-have">
            <input type="checkbox" checked={has} onChange={(e) => setHas(e.target.checked)} />
            {L.have}
          </label>

          {has ? (
            <label className="cf-field">
              <span>{L.num}</span>
              <input
                value={num}
                inputMode="numeric"
                maxLength={5}
                placeholder="42"
                onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          ) : (
            <label className="cf-field">
              <span>{L.what}</span>
              <textarea value={what} maxLength={300} rows={3} placeholder={L.whatPh} onChange={(e) => setWhat(e.target.value)} />
              {menuHref && (
                <a href={menuHref} className="cf-menu">
                  {L.menu}
                </a>
              )}
            </label>
          )}

          <div className="cf-field">
            <span>{L.plate}</span>
            <PlateInput value={plate} onChange={setPlate} label={L.plate} />
          </div>

          <CarDetails lang="tr" color={car.color} model={car.model} note={car.note} onChange={setCar} />

          <label className="cf-field">
            <span>{L.name}</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>

          <p className="cf-hint">{L.pay}</p>
          {error && <p className="cf-error" role="alert">{error}</p>}
          <button className="cf-send" disabled={!ready || busy} onClick={() => void send()}>
            {busy ? L.sending : L.send}
          </button>
        </>
      )}
    </div>
  );
}
