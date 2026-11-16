"use client";

import { useCallback, useEffect, useState } from "react";
import "./forms.css";
import "./team.css";
import { useLang } from "@/lib/i18n";
import { useMe } from "@/lib/use-me";
import { QrCode } from "@/components/display/QrCode";
import "@/components/display/display.css";
import "./poster.css";

type Links = { display: string; waiting: string };
type Kind = "display" | "waiting";

export function ScreensView() {
  const { t } = useLang();
  const [links, setLinks] = useState<Links | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const me = useMe();
  const [poster, setPoster] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/screens", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load the links.");
      setLinks(body);
      setError(null);
      const p = await fetch("/api/poster", { cache: "no-store" });
      if (p.ok) setPoster((await p.json()).url);
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

      <section className="fm-card pp-card">
        <h2>{t("Yazdırılabilir QR (iPad yok)", "Printed QR (no iPad)")}</h2>
        <p className="fm-help">
          {t(
            "iPad'iniz yoksa bu afişi bir kez yazdırıp kasaya asın. Müşteri kodu okutur, fişindeki sipariş numarasını yazar ve telefonu hazır olunca çalar. Her sipariş için ayrı QR gerekmez.",
            "No iPad? Print this poster once and put it at the till. The customer scans it, types the number on their receipt, and their phone rings when the order is ready. No QR per order needed.",
          )}
        </p>

        <div className="pp-sheet" aria-label={t("Afiş önizleme", "Poster preview")}>
          <div className="pp-store">{me?.store ?? ""}</div>
          <div className="pp-title">Okutun, siparişiniz hazır olunca haber verelim</div>
          <div className="pp-sub">Scan and we&apos;ll buzz you when your order is ready</div>
          <div className="pp-qr">{poster ? <QrCode value={poster} /> : null}</div>
          <ol className="pp-steps">
            <li>
              <b>1</b>
              <span>
                QR kodu okutun
                <i>Scan the code</i>
              </span>
            </li>
            <li>
              <b>2</b>
              <span>
                Fişteki numarayı yazın
                <i>Type the number on your receipt</i>
              </span>
            </li>
            <li>
              <b>3</b>
              <span>
                Hazır olunca telefonunuz çalar
                <i>Your phone rings when it&apos;s ready</i>
              </span>
            </li>
          </ol>
        </div>

        <div className="sc-link">
          <button className="fm-ghost" disabled={!poster} onClick={() => window.print()}>
            {t("Yazdır", "Print")}
          </button>
          <input className="sc-url" readOnly value={poster ?? ""} aria-label={t("Afiş bağlantısı", "Poster link")} onFocus={(e) => e.currentTarget.select()} />
          <button className="fm-ghost" disabled={!poster} onClick={() => void copy("poster", poster ?? "")}>
            {copied === "poster" ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
          </button>
        </div>
      </section>

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
