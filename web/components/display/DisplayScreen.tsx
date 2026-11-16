"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentOrder, simulateScan, type DisplayOrder } from "@/lib/display-source";
import { Receipt, ReceiptPrinter } from "@/components/receipt/Receipt";
import { QrCode } from "./QrCode";
import "./display.css";

type Phase = "idle" | "scanned" | "leaving";

type Settings = {
  storeName: string;
  /** Show the "Simulate scan" button (always on in development). */
  demo: boolean;
  /** Scan by itself every few seconds: handy for showing the animation. */
  auto: boolean;
};

const SCANNED_HOLD_MS = 3600;
const LEAVE_MS = 1000;
const AUTO_SCAN_MS = 5200;
const POLL_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readSettings(): Settings {
  const q = new URLSearchParams(window.location.search);
  return {
    storeName: q.get("store")?.trim() || "Demo Kahve",
    demo: q.has("demo") || process.env.NODE_ENV === "development",
    auto: q.has("auto"),
  };
}

type DisplayProps = {
  /** When opened from a screen link: its token, and the store's name. */
  token?: string;
  storeName?: string;
};

export function DisplayScreen({ token, storeName: linkStoreName }: DisplayProps = {}) {
  const busyRef = useRef(false);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [order, setOrder] = useState<DisplayOrder | null>(null);
  const [printedAt, setPrintedAt] = useState<Date | null>(null);
  const [offline, setOffline] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");

  /* Read the URL. Browser-only, so it runs after mount. */
  useEffect(() => {
    // A timer, not an animation frame: frames pause while the tab is hidden.
    const id = setTimeout(() => setSettings({ ...readSettings(), ...(linkStoreName ? { storeName: linkStoreName } : {}) }), 0);
    return () => clearTimeout(id);
  }, [linkStoreName]);

  const showOrder = useCallback((next: DisplayOrder | null) => {
    setOrder(next);
    setPrintedAt(next ? new Date() : null);
  }, []);

  const onScan = useCallback(async () => {
    if (busyRef.current || !order) return;
    busyRef.current = true;
    setPhase("scanned");
    await sleep(SCANNED_HOLD_MS);
    setPhase("leaving");
    await sleep(LEAVE_MS);
    // Back to waiting: the poll below brings in the cashier's next order.
    showOrder(null);
    setPhase("idle");
    busyRef.current = false;
  }, [order, showOrder]);

  /* While idle, ask the backend which order to show and whether it was scanned. */
  useEffect(() => {
    if (!settings || phase !== "idle") return;
    let cancelled = false;
    const tick = async () => {
      let latest: DisplayOrder | null;
      try {
        latest = await fetchCurrentOrder(token);
      } catch {
        if (!cancelled) setOffline(true);
        return;
      }
      if (cancelled || busyRef.current) return;
      setOffline(false);
      if (latest && !latest.scanned) {
        if (latest.token !== order?.token) showOrder(latest);
      } else if (latest && latest.token === order?.token) {
        void onScan();
      } else if (order) {
        showOrder(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [settings, phase, order, onScan, token, showOrder]);

  /** Demo: hit the tracking endpoint like a phone would, then play the scan. */
  const demoScan = useCallback(async () => {
    if (busyRef.current || !order) return;
    await simulateScan(order.token).catch(() => undefined);
    void onScan();
  }, [order, onScan]);

  /* Demo controls: S or Space scans; ?auto scans on a timer. */
  useEffect(() => {
    if (!settings?.demo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "s" || e.key === "S" || e.key === " ") {
        e.preventDefault();
        void demoScan();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings?.demo, demoScan]);

  useEffect(() => {
    if (!settings?.auto || phase !== "idle" || !order) return;
    const id = setTimeout(() => void demoScan(), AUTO_SCAN_MS);
    return () => clearTimeout(id);
  }, [settings?.auto, phase, order, demoScan]);

  const storeName = settings?.storeName ?? "";

  return (
    <main className="qd-stage" data-phase={phase} data-empty={!order}>
      <ReceiptPrinter fill>
        {order && (
          <Receipt
            key={order.token}
            store={storeName}
            number={order.orderNumber}
            when={printedAt}
            leaving={phase === "leaving"}
            phase={phase}
          >
            <div className="qd-qrBox">
              <div className="qd-qrWrap" data-hidden={phase !== "idle"}>
                <QrCode value={order.trackingUrl} />
              </div>
              <div className="qd-done" data-on={phase !== "idle"} aria-live="polite">
                <svg className="qd-check" viewBox="0 0 52 52" aria-hidden>
                  <circle cx="26" cy="26" r="24" />
                  <path d="M15.5 26.5l7.2 7.2 13.8-14.4" />
                </svg>
                <div className="qd-doneTitle">Tarandı</div>
                <div className="qd-doneAlt">Scanned</div>
              </div>
            </div>

            <div className="qd-prompt">Okutun, siparişiniz hazır olunca haber verelim</div>
            <div className="qd-promptAlt">Scan and we&apos;ll buzz you when it&apos;s ready</div>
          </Receipt>
        )}
      </ReceiptPrinter>

      {settings && !order && (
        <div className="qd-waiting" aria-live="polite">
          <div className="qd-waitingTitle">{offline ? "Bağlantı bekleniyor" : "Sıradaki sipariş bekleniyor"}</div>
          <div className="qd-waitingAlt">{offline ? "Can't reach the server. Retrying…" : "Waiting for the next order"}</div>
        </div>
      )}

      {settings?.demo && (
        <button className="qd-demo" onClick={() => void demoScan()} disabled={phase !== "idle" || !order}>
          Simulate scan (S)
        </button>
      )}
    </main>
  );
}
