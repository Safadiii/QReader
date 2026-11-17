"use client";

import { useCallback, useEffect, useState } from "react";
import "./mobile.css";
import { useLang } from "@/lib/i18n";
import { PrintJob, Sign } from "./Signs";
import { useMe } from "@/lib/use-me";

type Settings = {
  enabled: boolean;
  collect_enabled: boolean;
  car_enabled: boolean;
  table_enabled: boolean;
  table_count: number;
  hours_mode: "always" | "custom";
  opens: string;
  closes: string;
};

type WayKey = "collect_enabled" | "car_enabled" | "table_enabled";

const WAYS: { key: WayKey; d: string }[] = [
  { key: "collect_enabled", d: "M6 7h12l1 13H5zM9 7a3 3 0 0 1 6 0" },
  { key: "car_enabled", d: "M5 16v-4l2-5h10l2 5v4M3 16h18v2a1 1 0 0 1-1 1h-2v-2M5 19H4a1 1 0 0 1-1-1v-2M7.5 13h.01M16.5 13h.01" },
  { key: "table_enabled", d: "M4 10h16M6 10l-1 9M18 10l1 9M3 10l2-5h14l2 5" },
];

const same = (a: Settings | null, b: Settings | null) => JSON.stringify(a) === JSON.stringify(b);

export function MobileOrdersPanel() {
  const { t } = useLang();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const me = useMe();
  const [open, setOpen] = useState<WayKey | null>("car_enabled");
  const [carUrl, setCarUrl] = useState<string | null>(null);
  const [menuUrl, setMenuUrl] = useState<string | null>(null);
  const [printing, setPrinting] = useState<"car" | "collect" | "tables" | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/mobile-orders", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load.");
      const { enabled, collect_enabled, car_enabled, table_enabled, table_count, hours_mode, opens, closes } = body;
      const s = { enabled, collect_enabled, car_enabled, table_enabled, table_count, hours_mode, opens, closes };
      setSaved(s);
      setForm(s);
      const l = await fetch("/api/menu-link", { cache: "no-store" });
      if (l.ok) {
        const links = await l.json();
        setCarUrl(links.car_url ?? null);
        setMenuUrl(links.url ?? null);
      }
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : "Could not load." });
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const dirty = !same(saved, form);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/kitchen/mobile-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("Kaydedilemedi.", "Could not save."));
      const { enabled, collect_enabled, car_enabled, table_enabled, table_count, hours_mode, opens, closes } = body;
      const s = { enabled, collect_enabled, car_enabled, table_enabled, table_count, hours_mode, opens, closes };
      setSaved(s);
      setForm(s);
      setNote({ kind: "ok", text: t("Kaydedildi", "Saved") });
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : t("Kaydedilemedi.", "Could not save.") });
    }
    setBusy(false);
  };

  const store = me?.store ?? "";
  const collectUrl = menuUrl ? `${menuUrl}?mode=collect` : null;
  const carSign = {
    store,
    title: "Arabanızdan sipariş verin",
    sub: "Order from your car",
    url: carUrl,
    steps: [
      { tr: "QR kodu okutun", en: "Scan the code" },
      { tr: "Ne istediğinizi ve plakanızı yazın", en: "Tell us what you want and your plate" },
      { tr: "Siparişinizi arabanıza getirelim", en: "We bring it to your car" },
    ],
  };
  const collectSign = {
    store,
    title: "Telefonunuzdan sipariş verin",
    sub: "Order from your phone",
    url: collectUrl,
    steps: [
      { tr: "QR kodu okutun", en: "Scan the code" },
      { tr: "Menüden seçin ve gönderin", en: "Choose from the menu and send" },
      { tr: "Hazır olunca telefonunuz çalar", en: "Your phone rings when it's ready" },
    ],
  };
  const LinkRow = ({ url, print, printLabel }: { url: string | null; print: () => void; printLabel: string }) => (
    <>
      <div className="mo-linkRow">
        <button type="button" className="fm-primary" disabled={!url} onClick={print}>
          {printLabel}
        </button>
      </div>
      <div className="mo-linkRow">
        <input className="fm-input" readOnly value={url ?? ""} aria-label={t("Bağlantı", "Link")} onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="fm-ghost"
          disabled={!url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url ?? "");
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* selectable as a fallback */
            }
          }}
        >
          {copied ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
        </button>
        {url && (
          <a className="fm-ghost mn-open" href={url} target="_blank" rel="noreferrer">
            {t("Aç", "Open")}
          </a>
        )}
      </div>
    </>
  );

  const text: Record<WayKey, { name: string; line: string }> = {
    collect_enabled: {
      name: t("Gel-al", "Collect"),
      line: t("Hazır olunca telefon çalar, müşteri tezgâha gelir.", "Their phone rings when it's ready and they come to the counter."),
    },
    car_enabled: {
      name: t("Arabaya servis", "To the car"),
      line: t("Müşteri plakasını yazar; hazır olunca siz arabaya çıkarırsınız.", "The customer enters their plate; when it's ready you bring it out to the car."),
    },
    table_enabled: {
      name: t("Masaya servis", "To the table"),
      line: t("Müşteri masasını yazar; hazır olunca masaya götürürsünüz. Telefon çalmaz.", "The customer enters their table; you carry it over. Their phone stays quiet."),
    },
  };

  return (
    <section className="fm-card ex-feature mo">
      <header className="ex-head">
        <div>
          <h2>{t("Telefondan sipariş", "Mobile orders")}</h2>
          <p className="fm-help">
            {t(
              "Müşteri siparişini telefonundan takip eder ve nasıl teslim alacağını seçer.",
              "Customers follow their order on their phone and choose how they get it.",
            )}
          </p>
        </div>
        {form && (
          <label className="ex-switch">
            <input
              type="checkbox"
              role="switch"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              aria-label={t("Telefondan siparişi aç", "Turn on mobile orders")}
            />
            <span aria-hidden />
            <b>{form.enabled ? t("Açık", "On") : t("Kapalı", "Off")}</b>
          </label>
        )}
      </header>

      {note?.kind === "error" && <div className="fm-notice">{note.text}</div>}

      {form && (
        <div className="mo-body" data-off={!form.enabled}>
          <h3 className="mo-h">{t("Teslim yolları", "Ways to get an order")}</h3>
          <ul className="mo-ways">
            {WAYS.map((w) => {
              const on = form[w.key];
              const expanded = open === w.key;
              return (
                <li key={w.key} className="mo-way" data-on={on} data-open={expanded}>
                  <div className="mo-wayTop">
                    <span className="mo-ico" aria-hidden>
                      <svg viewBox="0 0 24 24"><path d={w.d} /></svg>
                    </span>
                    <button
                      type="button"
                      className="mo-wayText"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : w.key)}
                    >
                      <b>{text[w.key].name}</b>
                      <span>{text[w.key].line}</span>
                    </button>
                    <label className="ex-switch mo-mini">
                      <input
                        type="checkbox"
                        role="switch"
                        checked={on}
                        onChange={(e) => setForm({ ...form, [w.key]: e.target.checked })}
                        aria-label={text[w.key].name}
                      />
                      <span aria-hidden />
                    </label>
                  </div>

                  {expanded && w.key === "car_enabled" && (
                    <div className="mo-detail mo-detail-car">
                      <Sign {...carSign} />
                      <div className="mo-carlink">
                        <span className="ex-label">{t("Otopark QR’ı", "Car park QR")}</span>
                        <p className="mo-hint">
                          {t(
                            "Bu tabelayı yazdırıp otoparka asın. Araçtaki müşteri kodu okutur, ne istediğini yazar, plakasını ve araç özelliklerini girer; sipariş numarasıyla birlikte size gelir.",
                            "Print this sign and put it up in the car park. A customer in their car scans it, writes what they want, enters their plate and car details, and it reaches you with their order number.",
                          )}
                        </p>
                        <LinkRow url={carUrl} print={() => setPrinting("car")} printLabel={t("Tabelayı yazdır", "Print the sign")} />
                      </div>
                    </div>
                  )}
                  {expanded && w.key === "collect_enabled" && (
                    <div className="mo-detail mo-detail-car">
                      <Sign {...collectSign} />
                      <div className="mo-carlink">
                        <span className="ex-label">{t("Sipariş bağlantısı", "Order link")}</span>
                        <p className="mo-hint">
                          {t(
                            "Bu bağlantıyı ya da QR’ı tezgâha, vitrine veya sosyal medyaya koyun. Müşteri menüden sipariş verir, hazır olunca telefonu çalar, gelip alır. Menü açık olmalı (aşağıdaki “Dijital menü”).",
                            "Put this link or QR at the counter, in the window or on social media. Customers order from the menu, their phone rings when it's ready, and they come to collect. The Digital menu below must be on.",
                          )}
                        </p>
                        <LinkRow url={collectUrl} print={() => setPrinting("collect")} printLabel={t("Tabelayı yazdır", "Print the sign")} />
                      </div>
                    </div>
                  )}
                  {expanded && w.key === "table_enabled" && (
                    <div className="mo-detail mo-detail-simple">
                      <div className="mo-carlink">
                        <span className="ex-label">{t("Kaç masa var?", "How many tables?")}</span>
                        <div className="tb-count">
                          <div className="ex-stepper">
                            <button type="button" className="fm-ghost" aria-label={t("Azalt", "Fewer")} disabled={form.table_count <= 0} onClick={() => setForm({ ...form, table_count: form.table_count - 1 })}>−</button>
                            <output aria-live="polite">{form.table_count}</output>
                            <button type="button" className="fm-ghost" aria-label={t("Artır", "More")} disabled={form.table_count >= 200} onClick={() => setForm({ ...form, table_count: form.table_count + 1 })}>+</button>
                          </div>
                          <button
                            type="button"
                            className="fm-primary"
                            disabled={!menuUrl || saved?.table_count !== form.table_count || form.table_count < 1}
                            onClick={() => setPrinting("tables")}
                            title={saved?.table_count !== form.table_count ? t("Önce kaydedin", "Save first") : undefined}
                          >
                            {t("Masa kodlarını yazdır", "Print table codes")}
                          </button>
                        </div>
                        <p className="mo-hint">
                          {t(
                            "Her masa için ayrı bir QR basılır. Müşteri masasındaki kodu okutur, menüden sipariş verir; masa numarası otomatik yazılır ve siparişte görünür. Menü açık olmalı.",
                            "One QR is printed per table. The customer scans the code on their table and orders from the menu; the table number is filled in for them and shows on the order. The Digital menu must be on.",
                          )}
                        </p>
                        {menuUrl && saved && saved.table_count > 0 && (
                          <div className="tb-grid">
                            {Array.from({ length: Math.min(saved.table_count, 200) }, (_, i) => i + 1).map((n) => (
                              <div key={n} className="tb-tile">
                                <b>{t("Masa", "Table")} {n}</b>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <h3 className="mo-h">{t("Sipariş saatleri", "Order hours")}</h3>
          <div className="mo-hours">
            <div className="mo-seg" role="radiogroup" aria-label={t("Sipariş saatleri", "Order hours")}>
              {(["always", "custom"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={form.hours_mode === m}
                  data-on={form.hours_mode === m}
                  onClick={() => setForm({ ...form, hours_mode: m })}
                >
                  {m === "always" ? t("Her zaman", "Always") : t("Belirli saatler", "Set hours")}
                </button>
              ))}
            </div>
            {form.hours_mode === "custom" && (
              <div className="mo-times">
                <label>
                  <span>{t("Açılış", "Opens")}</span>
                  <input className="fm-input" type="time" value={form.opens} onChange={(e) => setForm({ ...form, opens: e.target.value })} />
                </label>
                <label>
                  <span>{t("Kapanış", "Closes")}</span>
                  <input className="fm-input" type="time" value={form.closes} onChange={(e) => setForm({ ...form, closes: e.target.value })} />
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      <PrintJob active={printing !== null} onDone={() => setPrinting(null)}>
        {printing === "car" && <Sign {...carSign} />}
        {printing === "collect" && <Sign {...collectSign} />}
        {printing === "tables" &&
          menuUrl &&
          saved &&
          Array.from({ length: Math.min(saved.table_count, 200) }, (_, i) => i + 1).map((n) => (
            <Sign
              key={n}
              store={store}
              big={`Masa ${n} · Table ${n}`}
              title="Sipariş vermek için okutun"
              sub="Scan to order from your table"
              url={`${menuUrl}?table=${n}`}
              steps={[
                { tr: "QR kodu okutun", en: "Scan the code" },
                { tr: "Menüden seçin ve gönderin", en: "Choose from the menu and send" },
                { tr: "Siparişiniz masanıza gelir", en: "We bring it to your table" },
              ]}
            />
          ))}
      </PrintJob>

      <footer className="mo-foot">
        <span role="status" data-kind={note?.kind}>
          {dirty ? t("Kaydedilmemiş değişiklikler", "Unsaved changes") : note?.kind === "ok" ? note.text : ""}
        </span>
        <button className="fm-primary" disabled={!dirty || busy} onClick={() => void save()}>
          {t("Kaydet", "Save")}
        </button>
      </footer>
    </section>
  );
}
