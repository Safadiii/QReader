"use client";

import { useCallback, useEffect, useState } from "react";
import "./delivery.css";
import { PlateInput, TurkishPlate } from "./TurkishPlate";
import { isValidPlate } from "./plate";
import { CarDetails } from "./CarDetails";
import { colorOf } from "./colors";

type State = {
  available: boolean;
  collect: boolean;
  car: boolean;
  table: boolean;
  mode: "collect" | "car" | "table" | null;
  car_plate: string | null;
  car_note: string | null;
  car_color: string | null;
  car_model: string | null;
  table_label: string | null;
};
type Mode = "collect" | "car" | "table";

const T = {
  title: { tr: "Siparişinizi nasıl alırsınız?", en: "How would you like it?" },
  collect: { tr: "Gel-al", en: "I'll collect" },
  car: { tr: "Arabama getirin", en: "Bring it to my car" },
  table: { tr: "Masama getirin", en: "Bring it to my table" },
  plate: { tr: "Araç plakanız", en: "Your car's plate" },
  note: { tr: "Renk, model veya park yeri (isteğe bağlı)", en: "Colour, model or spot (optional)" },
  table_ph: { tr: "Masa numarası", en: "Table number" },
  send: { tr: "Onayla", en: "Confirm" },
  change: { tr: "Değiştir", en: "Change" },
  saved: { tr: "Kaydedildi", en: "Got it" },
  fail: { tr: "Kaydedilemedi, tekrar deneyin.", en: "Couldn't save. Try again." },
};

/** On the customer's phone: pick collect, car (with the plate) or table. Hidden when the café has it off. */
export function DeliveryPick({ token, lang }: { token: string; lang: "tr" | "en" }) {
  const [st, setSt] = useState<State | null>(null);
  const [pick, setPick] = useState<Mode | null>(null);
  const [plate, setPlate] = useState("");
  const [note, setNote] = useState("");
  const [color, setColor] = useState("");
  const [model, setModel] = useState("");
  const [table, setTable] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const x = (k: keyof typeof T) => T[k][lang];

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(token)}/delivery`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as State;
      setSt(body);
      if (body.car_plate) setPlate(body.car_plate);
      if (body.car_note) setNote(body.car_note);
      if (body.car_color) setColor(body.car_color);
      if (body.car_model) setModel(body.car_model);
      if (body.table_label) setTable(body.table_label);
    } catch {
      /* the page works without it */
    }
  }, [token]);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  if (!st || (!st.available && !st.mode)) return null;

  const send = async (mode: Mode) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/track/${encodeURIComponent(token)}/delivery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          car_plate: mode === "car" ? plate : null,
          car_note: mode === "car" ? note : null,
          car_color: mode === "car" ? color : null,
          car_model: mode === "car" ? model : null,
          table_label: mode === "table" ? table : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : x("fail"));
      setSt(body);
      setEditing(false);
      setPick(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : x("fail"));
    }
    setBusy(false);
  };

  const chosen = st.mode && !editing;
  const modes = (["collect", "car", "table"] as Mode[]).filter((m) => st[m]);

  return (
    <section className="dp" aria-label={x("title")}>
      {chosen ? (
        <div className="dp-done">
          <div>
            <small>{st.mode === "collect" ? x("collect") : st.mode === "car" ? x("car") : x("table")}</small>
            {st.mode === "car" && st.car_plate && <TurkishPlate value={st.car_plate} size="md" />}
            {st.mode === "car" && (st.car_color || st.car_model || st.car_note) && (
              <p>
                {[colorOf(st.car_color)?.[lang], st.car_model, st.car_note].filter(Boolean).join(" · ")}
              </p>
            )}
            {st.mode === "table" && <b>{st.table_label}</b>}
          </div>
          {st.available && (
            <button type="button" className="dp-link" onClick={() => { setEditing(true); setPick(st.mode); }}>
              {x("change")}
            </button>
          )}
        </div>
      ) : (
        <>
          <h3>{x("title")}</h3>
          <div className="dp-modes">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                className="dp-mode"
                data-on={pick === m}
                onClick={() => (m === "collect" ? void send("collect") : setPick(m))}
                disabled={busy}
              >
                {x(m)}
              </button>
            ))}
          </div>

          {pick === "car" && (
            <div className="dp-form">
              <span>{x("plate")}</span>
              <PlateInput value={plate} onChange={setPlate} label={x("plate")} />
              <CarDetails
                lang={lang}
                color={color}
                model={model}
                note={note}
                onChange={(v) => {
                  setColor(v.color);
                  setModel(v.model);
                  setNote(v.note);
                }}
              />
              <button className="dp-send" disabled={busy || !isValidPlate(plate)} onClick={() => void send("car")}>
                {x("send")}
              </button>
            </div>
          )}
          {pick === "table" && (
            <div className="dp-form">
              <input
                className="dp-input"
                value={table}
                maxLength={20}
                placeholder={x("table_ph")}
                onChange={(e) => setTable(e.target.value)}
              />
              <button className="dp-send" disabled={busy || !table.trim()} onClick={() => void send("table")}>
                {x("send")}
              </button>
            </div>
          )}
          {error && <p className="dp-error" role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
