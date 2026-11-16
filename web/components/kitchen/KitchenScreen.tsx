"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./kitchen.css";
import { reloadTo } from "@/lib/navigate";
import { tt, useLang, type Lang } from "@/lib/i18n";
import { OrderNumber } from "@/components/ui/OrderNumber";
import { useMe } from "@/lib/use-me";
import { QrSlip } from "./QrSlip";
import type { Order, Status } from "./types";

const POLL_MS = 2000;

const COLUMNS: { status: Status; tr: string; en: string; emptyTr: string; emptyEn: string }[] = [
  { status: "pending", tr: "Yeni", en: "New", emptyTr: "Yeni sipariş yok", emptyEn: "No new orders" },
  {
    status: "preparing",
    tr: "Hazırlanıyor",
    en: "Preparing",
    emptyTr: "Hazırlanan sipariş yok",
    emptyEn: "Nothing being prepared",
  },
  {
    status: "ready",
    tr: "Hazır",
    en: "Ready",
    emptyTr: "Teslim bekleyen yok",
    emptyEn: "Nothing waiting for pickup",
  },
];

const NEXT: Partial<Record<Status, { to: Status; tr: string; en: string }>> = {
  pending: { to: "preparing", tr: "Hazırla", en: "Start" },
  preparing: { to: "ready", tr: "Hazır", en: "Mark ready" },
  ready: { to: "collected", tr: "Teslim edildi", en: "Collected" },
};

/** Today's date as the backend writes it (YYYY-MM-DD), in this device's timezone. */
function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function minutesSince(iso: string, now: number, lang: Lang) {
  const tr = lang === "tr";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return tr ? "şimdi" : "now";
  if (mins < 60) return tr ? `${mins} dk` : `${mins} min`;
  return tr ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** 95 -> "1m" (en) / "1 dk" (tr), 6060 -> "1h 41m" / "1 sa 41 dk". */
export function duration(seconds: number | null, lang: Lang = "en") {
  if (seconds === null) return "—";
  const tr = lang === "tr";
  const mins = Math.round(seconds / 60);
  if (mins < 1) return tr ? `${Math.round(seconds)} sn` : `${Math.round(seconds)}s`;
  if (mins < 60) return tr ? `${mins} dk` : `${mins}m`;
  return tr ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

type Props = {
  /** Inside the dashboard: shows the day's numbers and drops the full-screen frame. */
  embedded?: boolean;
};

export function KitchenScreen({ embedded = false }: Props) {
  const { lang, t } = useLang();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [now, setNow] = useState(0);
  const [offline, setOffline] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const me = useMe();
  const [slip, setSlip] = useState<{ order: Order; x: number; y: number } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/orders", { cache: "no-store" });
      if (res.status === 401) reloadTo(`/login?next=${window.location.pathname}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? tt("Siparişler yüklenemedi.", "Can't load orders."));
      setOrders(body.orders);
      setOffline(null);
    } catch (err) {
      setOffline(
        err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : tt("Sunucuya ulaşılamıyor. Yeniden deneniyor…", "Can't reach the server. Retrying…"),
      );
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [refresh]);

  const todays = (orders ?? []).filter((o) => o.order_date === today());
  const nextNumber = todays.reduce((max, o) => Math.max(max, o.order_number), 0) + 1;
  const numberValue = typed ?? String(nextNumber);

  const addOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy("new");
    setNotice(null);
    try {
      const res = await fetch("/api/kitchen/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber: Number(numberValue) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(body.error ?? tt("Sipariş oluşturulamadı.", "Could not create the order."));
      else setTyped(null); // back to suggesting the next number
    } catch {
      setNotice(tt("Sunucuya ulaşılamıyor.", "Can't reach the server."));
    }
    await refresh();
    setBusy(null);
    numberRef.current?.focus(); // ready for the next order straight away
  };

  const move = async (order: Order, status: Status) => {
    if (busy) return;
    setBusy(order.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/kitchen/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(body.error ?? tt("Sipariş güncellenemedi.", "Could not update the order."));
    } catch {
      setNotice(tt("Sunucuya ulaşılamıyor.", "Can't reach the server."));
    }
    await refresh();
    setBusy(null);
  };

  const ring = async (order: Order) => {
    if (busy) return;
    setBusy(order.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/kitchen/orders/${order.id}/ring`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNotice(body.error ?? tt("Müşteri aranamadı.", "Could not ring the customer."));
    } catch {
      setNotice(tt("Sunucuya ulaşılamıyor.", "Can't reach the server."));
    }
    await refresh();
    setBusy(null);
  };

  const all = orders ?? [];
  const waitingCount = all.filter((o) => o.status === "pending" || o.status === "preparing").length;
  const readyCount = all.filter((o) => o.status === "ready").length;

  const done = todays.filter((o) => o.status === "collected" || o.status === "cancelled");

  /** One line saying where the customer is in the pickup. */
  const customerLine = (o: Order) => {
    if (o.status === "ready") {
      if (o.customer_coming_at) return { tone: "go", text: t("Müşteri yolda", "On the way"), at: o.customer_coming_at };
      if (o.customer_seen_at) return { tone: "seen", text: t("Müşteri gördü", "Saw it"), at: o.customer_seen_at };
      return { tone: "wait", text: t("Henüz görmedi", "Not seen yet"), at: null };
    }
    return {
      tone: o.scanned_at ? "seen" : "wait",
      text: o.scanned_at ? t("QR okutuldu", "QR scanned") : t("QR okutulmadı", "QR not scanned"),
      at: null,
    };
  };

  const actions = (o: Order) => {
    const next = NEXT[o.status];
    return (
      <div className="kd-actions">
        {(o.status === "pending" || o.status === "preparing") && (
          <button
            className="qs-open"
            aria-label={t(`${o.order_number} numaralı siparişin QR kodunu göster`, `Show QR for order ${o.order_number}`)}
            title={t("QR fişini göster", "Show the QR slip")}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setSlip({ order: o, x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
            </svg>
          </button>
        )}
        {next && (
          <button className="kd-go" disabled={busy !== null} onClick={() => void move(o, next.to)}>
            {t(next.tr, next.en)}
          </button>
        )}
        {o.status === "ready" && (
          <button
            className="kd-ghost"
            disabled={busy !== null || o.scanned_at === null}
            title={o.scanned_at === null ? t("Müşteri QR kodu okutmadı", "The customer hasn't scanned the QR") : undefined}
            onClick={() => void ring(o)}
          >
            {t("Tekrar çal", "Ring again")}
          </button>
        )}
        {(o.status === "pending" || o.status === "preparing") && (
          <button
            className="kd-ghost"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(t(`${o.order_number} numaralı sipariş iptal edilsin mi?`, `Cancel order ${o.order_number}?`)))
                void move(o, "cancelled");
            }}
          >
            {t("İptal", "Cancel")}
          </button>
        )}
      </div>
    );
  };

  const line = (o: Order) => {
    const c = customerLine(o);
    return (
      <p className="kd-line" data-tone={c.tone}>
        {c.text}
        {c.at && <span>{clock(c.at)}</span>}
      </p>
    );
  };

  return (
    <main className="kd-page" data-embedded={embedded}>
      <header className="kd-top">
        <div>
          <h1 className="kd-title">{embedded ? t("Siparişler", "Orders") : t("Mutfak", "Kitchen")}</h1>
          {orders !== null && (
            <p className="kd-meta">
              <span className="kd-open">
                <i aria-hidden />
                {me?.store ? `${me.store} · ` : ""}
                {t("açık", "open")}
              </span>
              {" · "}
              {t(`${waitingCount} bekliyor`, `${waitingCount} waiting`)} ·{" "}
              {t(`${readyCount} hazır`, `${readyCount} ready`)} ·{" "}
              {t(`bugün ${todays.length} sipariş`, `${todays.length} orders today`)}
            </p>
          )}
        </div>

        <div className="kd-tools">
          <form className="kd-new" onSubmit={(e) => void addOrder(e)}>
            <label className="kd-newLabel" htmlFor="kd-number">
              {t("Sipariş no", "Order no.")}
            </label>
            <input
              id="kd-number"
              ref={numberRef}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              className="kd-input"
              type="number"
              inputMode="numeric"
              min={1}
              required
              value={numberValue}
              onChange={(e) => setTyped(e.target.value)}
            />
            <button className="kd-add" type="submit" disabled={busy !== null || orders === null}>
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("Yeni sipariş", "New order")}
            </button>
          </form>
          {embedded && (
            <a className="kd-kitchenLink" href="/kitchen" target="_blank" rel="noreferrer">
              {t("Mutfak ekranı", "Kitchen screen")}
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </a>
          )}
        </div>
      </header>

      {(offline || notice) && (
        <div className="kd-notice" role="status" data-kind={offline ? "offline" : "error"}>
          {offline ?? notice}
        </div>
      )}

      <section className="kd-board">
        {COLUMNS.map((col) => {
          // Oldest first, so the order that has waited longest is on top.
          const list = all
            .filter((o) => o.status === col.status)
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          return (
            <div key={col.status} className="kd-col" data-status={col.status}>
              <h2 className="kd-colTitle">
                <span>
                  <i className="kd-dot" aria-hidden />
                  {t(col.tr, col.en)}
                </span>
                <b>{list.length}</b>
              </h2>
              {orders !== null && list.length === 0 && <p className="kd-empty">{t(col.emptyTr, col.emptyEn)}</p>}
              {list.map((o) => (
                <article key={o.id} className="kd-ticket" data-status={o.status}>
                  <OrderNumber value={o.order_number} status={o.status} size={84} />
                  <div className="kd-body">
                    <p className="kd-age">{minutesSince(o.created_at, now, lang)}</p>
                    {line(o)}
                    {actions(o)}
                  </div>
                </article>
              ))}
            </div>
          );
        })}
        </section>

      {done.length > 0 && (
        <section className="kd-done">
          <h2 className="kd-doneTitle">
            {t("Bugün biten", "Finished today")} <b>{done.length}</b>
          </h2>
          <ul>
            {done.map((o) => (
              <li key={o.id} data-status={o.status}>
                <b>{o.order_number}</b>
                {o.status === "collected" ? t("Teslim edildi", "Collected") : t("İptal edildi", "Cancelled")}
                {o.completed_at && <span>{clock(o.completed_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {slip && (
        <QrSlip
          orderId={slip.order.id}
          number={slip.order.order_number}
          store={me?.store ?? ""}
          printedAt={slip.order.created_at}
          origin={{ x: slip.x, y: slip.y }}
          onClose={() => setSlip(null)}
        />
      )}
    </main>
  );
}
