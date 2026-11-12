"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentOrder, simulateScan, type DisplayOrder } from "@/lib/display-source";
import type { FoilScene } from "@/lib/foil/scene";
import { QrCode } from "./QrCode";
import "./display.css";

type Phase = "idle" | "wrapping" | "scanned";

type Settings = {
  storeName: string;
  /** Show the "Simulate scan" button (always on in development). */
  demo: boolean;
  /** Scan by itself every few seconds: handy for showing the animation. */
  auto: boolean;
  /** Dev only: freeze the foil at this many seconds into the animation. */
  freeze: number | null;
};

const SCANNED_HOLD_MS = 4200;
const AUTO_SCAN_MS = 3800;
const POLL_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readSettings(): Settings {
  const q = new URLSearchParams(window.location.search);
  const freeze = q.get("freeze");
  return {
    storeName: q.get("store")?.trim() || "Demo Kahve",
    demo: q.has("demo") || process.env.NODE_ENV === "development",
    auto: q.has("auto"),
    freeze: freeze === null ? null : Number(freeze),
  };
}

export function DisplayScreen() {
  const stageRef = useRef<HTMLElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const foilRef = useRef<FoilScene | null>(null);
  const busyRef = useRef(false);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [order, setOrder] = useState<DisplayOrder | null>(null);
  const [offline, setOffline] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [cardHidden, setCardHidden] = useState(false);
  const [foilReady, setFoilReady] = useState(false);

  /* Read the URL. Browser-only, so it runs after mount. */
  useEffect(() => {
    // A timer, not an animation frame: frames pause while the tab is hidden.
    const id = setTimeout(() => setSettings(readSettings()), 0);
    return () => clearTimeout(id);
  }, []);

  /** Tells the 3D scene where the QR card is, in stage pixels. */
  const syncLayout = useCallback(() => {
    const stage = stageRef.current;
    const center = centerRef.current;
    const card = cardRef.current;
    const foil = foilRef.current;
    if (!stage || !center || !card || !foil) return;
    const s = stage.getBoundingClientRect();
    const c = center.getBoundingClientRect();
    // offset* ignores the float animation, so the foil lands on the resting spot
    foil.setLayout({
      width: s.width,
      height: s.height,
      cx: c.left - s.left + card.offsetLeft + card.offsetWidth / 2,
      cy: c.top - s.top + card.offsetTop + card.offsetHeight / 2,
      cardSize: card.offsetWidth,
    });
  }, []);

  /* Load three.js and build the foil while the customer is still looking at the QR. */
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    import("@/lib/foil/scene")
      .then(({ FoilScene }) => FoilScene.create(canvas, () => cancelled))
      .then((foil) => {
        if (!foil) return;
        if (cancelled) return foil.dispose();
        foilRef.current = foil;
        syncLayout();
        setFoilReady(true);
      })
      .catch((err) => {
        // No WebGL: the screen still works, it just skips the wrap.
        console.warn("Foil animation unavailable", err);
      });

    const observer = new ResizeObserver(syncLayout);
    observer.observe(stage);
    return () => {
      cancelled = true;
      observer.disconnect();
      foilRef.current?.dispose();
      foilRef.current = null;
    };
  }, [syncLayout]);

  const onScan = useCallback(async () => {
    if (busyRef.current || !order || !settings) return;
    busyRef.current = true;
    setPhase("wrapping");

    const foil = foilRef.current;
    if (foil) {
      const root = getComputedStyle(document.documentElement);
      const displayFont = root.getPropertyValue("--font-display").trim() || "Impact";
      const monoFont = root.getPropertyValue("--font-mono").trim() || "monospace";
      // The canvas can only draw fonts that have finished loading.
      await Promise.all([
        document.fonts.load(`400 100px ${displayFont}`, "DEMO KAHVE ĞİŞ"),
        document.fonts.load(`500 20px ${monoFont}`, "Sipariş"),
      ]).catch(() => undefined);

      syncLayout();
      foil.setLabel({
        storeName: settings.storeName,
        orderNumber: order.orderNumber,
        displayFont,
        monoFont,
      });
      await foil.play({
        onCovered: () => setCardHidden(true),
        onFalling: () => setPhase("scanned"),
      });
    } else {
      await sleep(350);
      setCardHidden(true);
      setPhase("scanned");
    }

    await sleep(SCANNED_HOLD_MS);
    // Back to waiting: the poll below brings in the cashier's next order.
    setOrder(null);
    setCardHidden(false);
    setPhase("idle");
    busyRef.current = false;
  }, [order, settings, syncLayout]);

  /* While idle, ask the backend which order to show and whether it was scanned. */
  useEffect(() => {
    if (!settings || phase !== "idle") return;
    let cancelled = false;
    const tick = async () => {
      let latest: DisplayOrder | null;
      try {
        latest = await fetchCurrentOrder();
      } catch {
        if (!cancelled) setOffline(true);
        return;
      }
      if (cancelled || busyRef.current) return;
      setOffline(false);
      if (latest && !latest.scanned) {
        if (latest.token !== order?.token) setOrder(latest);
      } else if (latest && latest.token === order?.token) {
        void onScan();
      } else if (order) {
        setOrder(null);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [settings, phase, order, onScan]);

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

  /* Dev: ?freeze=1.8 holds the foil at one moment so it can be inspected. */
  useEffect(() => {
    const foil = foilRef.current;
    if (!foilReady || !foil || !settings || !order || settings.freeze === null) return;
    const root = getComputedStyle(document.documentElement);
    const displayFont = root.getPropertyValue("--font-display").trim() || "Impact";
    const monoFont = root.getPropertyValue("--font-mono").trim() || "monospace";
    let cancelled = false;
    Promise.all([
      document.fonts.load(`400 100px ${displayFont}`, "DEMO KAHVE ĞİŞ"),
      document.fonts.load(`500 20px ${monoFont}`, "Sipariş"),
    ]).then(() => {
      if (cancelled) return;
      syncLayout();
      foil.setLabel({
        storeName: settings.storeName,
        orderNumber: order.orderNumber,
        displayFont,
        monoFont,
      });
      foil.freezeAt(settings.freeze ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [foilReady, settings, order, syncLayout]);

  const storeName = settings?.storeName ?? "";

  return (
    <main ref={stageRef} className="qd-stage" data-phase={phase} data-empty={!order}>
      <div className="qd-backdrop" aria-hidden />

      <header className="qd-header">
        <span className="qd-store">{storeName}</span>
        {order && (
          <span className="qd-orderTag">
            Sipariş / Order <b>{order.orderNumber}</b>
          </span>
        )}
      </header>

      <div ref={centerRef} className="qd-center">
        {order && (
          <div
            ref={cardRef}
            key={order.token}
            className="qd-cardWrap"
            data-hidden={cardHidden}
          >
            <span className="qd-bracket" aria-hidden />
            <span className="qd-bracket" aria-hidden />
            <span className="qd-bracket" aria-hidden />
            <span className="qd-bracket" aria-hidden />
            <div className="qd-card">
              <QrCode value={order.trackingUrl} />
              <div className="qd-sweep" aria-hidden />
            </div>
          </div>
        )}

        {settings && !order && phase === "idle" && (
          <div className="qd-waiting" aria-live="polite">
            <div className="qd-waitingTitle">
              {offline ? "Bağlantı bekleniyor" : "Sıradaki sipariş bekleniyor"}
            </div>
            <div className="qd-waitingAlt">
              {offline ? "Can't reach the server. Retrying…" : "Waiting for the next order"}
            </div>
          </div>
        )}

        <div className="qd-scanned" aria-live="polite">
          {phase === "scanned" && order && (
            <>
              <svg className="qd-check" viewBox="0 0 52 52" aria-hidden>
                <circle cx="26" cy="26" r="24" />
                <path d="M15.5 26.5l7.2 7.2 13.8-14.4" />
              </svg>
              <div className="qd-scannedTitle">Tarandı</div>
              <div className="qd-scannedLine">
                Sipariş {order.orderNumber} telefonunuza bağlandı.
              </div>
              <div className="qd-scannedAlt">
                Scanned. Order {order.orderNumber} is linked to your phone.
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="qd-footer">
        <div>
          <div className="qd-prompt">Okutun, siparişiniz hazır olunca haber verelim</div>
          <div className="qd-promptAlt">Scan and we&apos;ll buzz you when your order is ready</div>
        </div>
      </footer>

      <canvas ref={canvasRef} className="qd-foil" aria-hidden />

      {settings?.demo && (
        <button
          className="qd-demo"
          onClick={() => void demoScan()}
          disabled={phase !== "idle" || !order}
        >
          Simulate scan (S)
        </button>
      )}
    </main>
  );
}
