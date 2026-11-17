"use client";

import { useMemo, useState } from "react";
import { PlateInput } from "./TurkishPlate";
import { isValidPlate } from "./plate";
import { CarDetails } from "./CarDetails";

export type MenuItem = { has_photo?: boolean; id: string; category: string; name: string; description: string; price_cents: number; available: boolean };
export type PublicMenu = {
  store_name: string;
  currency: string;
  note: string;
  items: MenuItem[];
  ordering: { available: boolean; collect: boolean; car: boolean; table: boolean };
};
type Mode = "collect" | "car" | "table";

const money = (cents: number, cur: string) => `${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)} ${cur}`;

const L = {
  add: "Ekle · Add",
  view: "Siparişim · My order",
  title: "Siparişiniz · Your order",
  how: "Nasıl alırsınız? · How do you get it?",
  collect: "Gel-al · I'll collect",
  car: "Arabama getirin · To my car",
  table: "Masama getirin · To my table",
  plate: "Araç plakanız · Your car's plate",
  carNote: "Renk, model veya park yeri (isteğe bağlı) · Colour, model or spot (optional)",
  tableNo: "Masa numarası · Table number",
  name: "Adınız (isteğe bağlı) · Your name (optional)",
  note: "Sipariş notu (isteğe bağlı) · Note (optional)",
  pay: "Ödeme kafede yapılır. · You pay at the café.",
  place: "Siparişi gönder · Place order",
  sending: "Gönderiliyor… · Sending…",
  close: "Kapat · Close",
  fail: "Sipariş gönderilemedi. · Couldn't send the order.",
};

export function MenuBrowser({
  token,
  menu,
  table: presetTable = "",
  wantsCollect = false,
}: {
  token: string;
  menu: PublicMenu;
  /** From a table's QR: the table is already known. */
  table?: string;
  wantsCollect?: boolean;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const tableFixed = presetTable !== "" && menu.ordering.table;
  const [mode, setMode] = useState<Mode | null>(tableFixed ? "table" : wantsCollect && menu.ordering.collect ? "collect" : null);
  const [plate, setPlate] = useState("");
  const [carNote, setCarNote] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carModel, setCarModel] = useState("");
  const [table, setTable] = useState(tableFixed ? presetTable : "");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const can = menu.ordering.available;

  const groups = useMemo(() => {
    const g = new Map<string, MenuItem[]>();
    for (const i of menu.items) g.set(i.category || "", [...(g.get(i.category || "") ?? []), i]);
    return g;
  }, [menu.items]);

  const lines = menu.items.filter((i) => cart[i.id] > 0);
  const count = lines.reduce((n, i) => n + cart[i.id], 0);
  const total = lines.reduce((n, i) => n + cart[i.id] * i.price_cents, 0);
  const modes = tableFixed ? (["table"] as Mode[]) : (["collect", "car", "table"] as Mode[]).filter((m) => menu.ordering[m]);
  const active = mode ?? (modes.length === 1 ? modes[0] : null);

  const set = (id: string, qty: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, qty)) }));

  const ready =
    count > 0 && active !== null && (active !== "car" || isValidPlate(plate)) && (active !== "table" || table.trim() !== "");

  const send = async () => {
    if (!ready || !active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/menu/${encodeURIComponent(token)}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: active,
          car_plate: active === "car" ? plate : null,
          car_note: active === "car" ? carNote : null,
          car_color: active === "car" ? carColor : null,
          car_model: active === "car" ? carModel : null,
          table_label: active === "table" ? table : null,
          customer_name: name,
          note,
          lines: lines.map((i) => ({ item_id: i.id, qty: cart[i.id] })),
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
    <>
      <header className="pm-head">
        <h1>{menu.store_name}</h1>
        {menu.note && <p>{menu.note}</p>}
        {groups.size > 1 && (
          <nav aria-label="Categories">
            {[...groups.keys()].filter(Boolean).map((c) => (
              <a key={c} href={`#c-${encodeURIComponent(c)}`}>
                {c}
              </a>
            ))}
          </nav>
        )}
      </header>

      {[...groups.entries()].map(([cat, items]) => (
        <section key={cat || "other"} id={`c-${encodeURIComponent(cat)}`} className="pm-group">
          {cat && <h2>{cat}</h2>}
          <ul>
            {items.map((i) => (
              <li key={i.id} data-off={!i.available}>
                {i.has_photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pm-photo" src={`/api/menu/${encodeURIComponent(token)}/photo/${i.id}`} alt="" loading="lazy" />
                )}
                <div className="pm-text">
                  <b>{i.name}</b>
                  {i.description && <p>{i.description}</p>}
                </div>
                <div className="pm-side">
                  <span>{i.available ? money(i.price_cents, menu.currency) : "Tükendi · Sold out"}</span>
                  {can && i.available &&
                    (cart[i.id] > 0 ? (
                      <div className="pm-step">
                        <button aria-label="−" onClick={() => set(i.id, cart[i.id] - 1)}>−</button>
                        <output>{cart[i.id]}</output>
                        <button aria-label="+" onClick={() => set(i.id, cart[i.id] + 1)}>+</button>
                      </div>
                    ) : (
                      <button className="pm-add" onClick={() => set(i.id, 1)}>
                        {L.add}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {can && count > 0 && !open && (
        <button className="pm-bar" onClick={() => setOpen(true)}>
          <span>{L.view} · {count}</span>
          <b>{money(total, menu.currency)}</b>
        </button>
      )}

      {open && (
        <div className="pm-sheet" role="dialog" aria-modal="true" aria-label={L.title}>
          <div className="pm-panel">
            <header>
              <h2>{L.title}</h2>
              <button className="pm-x" onClick={() => setOpen(false)}>{L.close}</button>
            </header>

            <ul className="pm-lines">
              {lines.map((i) => (
                <li key={i.id}>
                  <span>{i.name}</span>
                  <div className="pm-step">
                    <button aria-label="−" onClick={() => set(i.id, cart[i.id] - 1)}>−</button>
                    <output>{cart[i.id]}</output>
                    <button aria-label="+" onClick={() => set(i.id, cart[i.id] + 1)}>+</button>
                  </div>
                  <b>{money(i.price_cents * cart[i.id], menu.currency)}</b>
                </li>
              ))}
            </ul>
            {count === 0 && <p className="pm-hint">—</p>}

            {tableFixed && <p className="pm-table">Masa · Table <b>{presetTable}</b></p>}
            {!tableFixed && <h3>{L.how}</h3>}
            <div className="pm-modes" hidden={tableFixed}>
              {modes.map((m) => (
                <button key={m} data-on={active === m} onClick={() => setMode(m)}>
                  {L[m]}
                </button>
              ))}
            </div>
            {active === "car" && (
              <div className="pm-form">
                <span>{L.plate}</span>
                <PlateInput value={plate} onChange={setPlate} label={L.plate} />
                <CarDetails
                  lang="tr"
                  color={carColor}
                  model={carModel}
                  note={carNote}
                  onChange={(v) => {
                    setCarColor(v.color);
                    setCarModel(v.model);
                    setCarNote(v.note);
                  }}
                />
              </div>
            )}
            {active === "table" && !tableFixed && (
              <div className="pm-form">
                <input value={table} maxLength={20} placeholder={L.tableNo} onChange={(e) => setTable(e.target.value)} />
              </div>
            )}

            <div className="pm-form">
              <input value={name} maxLength={40} placeholder={L.name} onChange={(e) => setName(e.target.value)} />
              <input value={note} maxLength={200} placeholder={L.note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <p className="pm-hint">{L.pay}</p>
            {error && <p className="pm-error" role="alert">{error}</p>}
            <button className="pm-send" disabled={!ready || busy} onClick={() => void send()}>
              {busy ? L.sending : `${L.place} · ${money(total, menu.currency)}`}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
