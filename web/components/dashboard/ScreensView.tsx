"use client";

import { useCallback, useEffect, useState } from "react";
import "./forms.css";
import "./team.css";
import { useLang } from "@/lib/i18n";

type Links = { display: string; waiting: string };
type Kind = "display" | "waiting";

export function ScreensView() {
  const { t } = useLang();
  const [links, setLinks] = useState<Links | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/screens", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load the links.");
      setLinks(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the links.");
    }
  }, []);

  useEffect(() => {
    // A timer, so the first load is not a state update inside the effect body.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* the address is selectable on screen */
    }
  };

  const regenerate = async (kind: Kind) => {
    if (
      !window.confirm(
        t(
          "Yeni bağlantı oluşturulsun mu? Eski bağlantı hemen çalışmayı bırakır; cihazda yenisini açmanız gerekir.",
          "Create a new link? The old one stops working at once, and you will need to open the new one on the device.",
        ),
      )
    )
      return;
    const res = await fetch(`/api/screens/${kind}/regenerate`, { method: "POST" });
    if (!res.ok) setError(t("Yenilenemedi.", "Could not create a new link."));
    await load();
  };

  const cards: { kind: Kind; title: string; help: string }[] = [
    {
      kind: "display",
      title: t("iPad: müşteri ekranı (QR)", "iPad: customer screen (QR)"),
      help: t(
        "Kasada müşteriye dönük durur ve sıradaki siparişin QR kodunu gösterir. Bağlantıyı iPad'de bir kez açın; giriş gerekmez.",
        "Faces the customer at the till and shows the QR for the newest order. Open the link on the iPad once; no sign-in is needed.",
      ),
    },
    {
      kind: "waiting",
      title: t("TV: bekleme ekranı", "TV: waiting screen"),
      help: t(
        "Hazır siparişleri listeler ve sesli çağırır. Bağlantıyı TV'nin tarayıcısında açın; giriş gerekmez.",
        "Lists the ready orders and calls them out loud. Open the link in the TV's browser; no sign-in is needed.",
      ),
    },
  ];

  return (
    <div className="fm-page">
      <h1 className="fm-title">{t("Ekranlar", "Screens")}</h1>
      <p className="fm-sub">
        {t("Cihazlar için bağlantılar", "Links for your devices")}
      </p>

      {error && <div className="fm-notice">{error}</div>}

      {cards.map((c) => {
        const url = links?.[c.kind] ?? "";
        return (
          <section className="fm-card" key={c.kind}>
            <h2>{c.title}</h2>
            <p className="fm-help">{c.help}</p>
            <div className="sc-link">
              <input className="sc-url" readOnly value={url} aria-label={c.title} onFocus={(e) => e.currentTarget.select()} />
              <button className="fm-ghost" disabled={!url} onClick={() => void copy(c.kind, url)}>
                {copied === c.kind ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
              </button>
              <a className="fm-ghost" href={url || undefined} target="_blank" rel="noreferrer" style={{ display: "inline-grid", placeItems: "center" }}>
                {t("Aç", "Open")} ↗
              </a>
              <button className="fm-ghost tm-danger" disabled={!url} onClick={() => void regenerate(c.kind)}>
                {t("Yeni bağlantı", "New link")}
              </button>
            </div>
          </section>
        );
      })}

      <section className="fm-card">
        <h2>{t("Mutfak ekranı", "Kitchen screen")}</h2>
        <p className="fm-help">
          {t(
            "Sipariş girer ve değiştirir, bu yüzden bağlantı yerine personel girişi (telefon + şifre) ister.",
            "It creates and changes orders, so it needs a staff sign-in (phone + password) instead of a link.",
          )}
        </p>
        <div className="sc-link">
          <a className="fm-ghost" href="/kitchen" target="_blank" rel="noreferrer" style={{ display: "inline-grid", placeItems: "center" }}>
            {t("Mutfak ekranını aç", "Open kitchen screen")} ↗
          </a>
        </div>
      </section>
    </div>
  );
}
