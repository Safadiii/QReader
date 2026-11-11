"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FoilScene } from "@/lib/foil/scene";
import { Ringer } from "@/lib/ringer";
import "./track.css";

type Status = "pending" | "preparing" | "ready" | "collected" | "cancelled";

type Order = {
  storeName: string;
  orderNumber: number;
  status: Status;
  /** Set once the customer has told the kitchen they are on their way. */
  coming: boolean;
};

type Problem = "invalid" | "expired" | "offline";
type Phase = "loading" | "arriving" | "open";
type FoilState = "pending" | "ready" | "none";

const POLL_MS = 3000;
/** If the foil is not built this long after the order arrives, skip the animation. */
const FOIL_PATIENCE_MS = 2500;

const COPY: Record<Status, { tr: string; en: string }> = {
  pending: { tr: "Siparişiniz alındı", en: "We've got your order" },
  preparing: { tr: "Hazırlanıyor", en: "Being prepared" },
  ready: { tr: "Hazır!", en: "Ready at the counter" },
  collected: { tr: "Afiyet olsun", en: "Collected. Enjoy!" },
  cancelled: { tr: "İptal edildi", en: "This order was cancelled" },
};

const PROBLEMS: Record<Problem, { tr: string; en: string }> = {
  invalid: { tr: "Bu bağlantı geçersiz", en: "This link isn't valid. Scan the code at the till again." },
  expired: { tr: "Bağlantının süresi doldu", en: "This link has expired. Ask at the counter." },
  offline: { tr: "Bağlanılamıyor", en: "Can't reach the cafe right now. Retrying…" },
};

const STEPS: Status[] = ["pending", "preparing", "ready"];

type Reply = { order: Order } | { problem: Problem };

async function request(token: string, action: "" | "/scan" | "/coming"): Promise<Reply> {
  try {
    const res = await fetch(`/api/track/${encodeURIComponent(token)}${action}`, {
      method: action ? "POST" : "GET",
      cache: "no-store",
    });
    if (res.ok) {
      const body = await res.json();
      return {
        order: {
          storeName: body.store_name,
          orderNumber: body.order_number,
          status: body.status,
          coming: body.customer_coming_at !== null,
        },
      };
    }
    if (res.status === 410) return { problem: "expired" };
    if (res.status === 404 || res.status === 422) return { problem: "invalid" };
    return { problem: "offline" };
  } catch {
    return { problem: "offline" };
  }
}

export function TrackView({ token }: { token: string }) {
  const stageRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const foilRef = useRef<FoilScene | null>(null);
  const ringerRef = useRef<Ringer | null>(null);

  const [order, setOrder] = useState<Order | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [foilState, setFoilState] = useState<FoilState>("pending");
  const [cardShown, setCardShown] = useState(false);

  const [ringerOn, setRingerOn] = useState(false);
  const [ringerNote, setRingerNote] = useState<"awake" | "keepOpen" | "blocked" | null>(null);
  const [silenced, setSilenced] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  /* Report the scan, then keep the status fresh. */
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let scanned = false;

    const tick = async () => {
      const reply = await request(token, scanned ? "" : "/scan");
      if (stopped) return;
      let finished = false;
      if ("order" in reply) {
        scanned = true;
        setOrder(reply.order);
        setProblem(null);
        finished = reply.order.status === "collected" || reply.order.status === "cancelled";
      } else {
        setProblem(reply.problem);
        finished = reply.problem !== "offline";
      }
      if (!finished) timer = setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);

  /** Tells the 3D scene where the order card is, in stage pixels. */
  const syncLayout = useCallback(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    const foil = foilRef.current;
    if (!stage || !card || !foil) return;
    const s = stage.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    foil.setLayout({
      width: s.width,
      height: s.height,
      cx: c.left - s.left + c.width / 2,
      cy: c.top - s.top + c.height / 2,
      cardSize: c.width,
    });
  }, []);

  /* Build the foil while the first status request is in flight. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const skip = () => {
      if (!cancelled) setFoilState("none");
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = setTimeout(skip, 0);
      return () => clearTimeout(id);
    }

    import("@/lib/foil/scene")
      .then(({ FoilScene }) => FoilScene.create(canvas, () => cancelled))
      .then((foil) => {
        if (!foil) return;
        if (cancelled) return foil.dispose();
        foilRef.current = foil;
        setFoilState("ready");
      })
      .catch(skip); // No WebGL: go straight to the card.

    return () => {
      cancelled = true;
      foilRef.current?.dispose();
      foilRef.current = null;
    };
  }, []);

  /* Once we know the order: drop the foil in and unwrap it. */
  const hasOrder = order !== null;
  useEffect(() => {
    if (!hasOrder || phase !== "loading") return;
    if (foilState === "pending") {
      const id = setTimeout(() => setFoilState((s) => (s === "pending" ? "none" : s)), FOIL_PATIENCE_MS);
      return () => clearTimeout(id);
    }
    const foil = foilRef.current;
    let cancelled = false;

    const run = async () => {
      if (foilState === "none" || !foil || !order) {
        setPhase("open");
        return;
      }
      setPhase("arriving");
      const root = getComputedStyle(document.documentElement);
      const displayFont = root.getPropertyValue("--font-display").trim() || "Impact";
      const monoFont = root.getPropertyValue("--font-mono").trim() || "monospace";
      // The canvas can only draw fonts that have finished loading.
      await Promise.all([
        document.fonts.load(`400 100px ${displayFont}`, `${order.storeName.toUpperCase()} ĞİŞ`),
        document.fonts.load(`500 20px ${monoFont}`, "Sipariş"),
      ]).catch(() => undefined);
      if (cancelled) return;

      syncLayout();
      foil.setLabel({
        storeName: order.storeName,
        orderNumber: order.orderNumber,
        displayFont,
        monoFont,
      });
      const freeze = new URLSearchParams(window.location.search).get("freeze");
      if (freeze !== null && process.env.NODE_ENV === "development") {
        // Dev: ?freeze=1.2 holds the foil at one moment so it can be inspected.
        setCardShown(true);
        foil.freezeArriveAt(Number(freeze));
        return;
      }
      await foil.playArrive({ onOpening: () => setCardShown(true) });
      if (!cancelled) setPhase("open");
    };

    const id = setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // `order` is read once, when it first arrives; later polls must not restart this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOrder, foilState, syncLayout]);

  /* Ring while the order is ready and nobody has answered yet. */
  const ringing = ringerOn && order?.status === "ready" && !order.coming && !silenced;
  useEffect(() => {
    const ringer = ringerRef.current;
    if (!ringer) return;
    if (ringing) ringer.ring();
    else ringer.stop();
  }, [ringing]);

  useEffect(() => () => ringerRef.current?.dispose(), []);

  const toggleRinger = async () => {
    const ringer = (ringerRef.current ??= new Ringer());
    if (ringerOn) {
      ringer.disable();
      setRingerOn(false);
      setRingerNote(null);
      return;
    }
    try {
      await ringer.enable();
      setRingerOn(true);
      // The wake lock resolves a moment after the tap.
      setTimeout(() => setRingerNote(ringer.staysAwake ? "awake" : "keepOpen"), 400);
    } catch {
      setRingerNote("blocked");
    }
  };

  const imComing = async () => {
    setSilenced(true);
    setSending(true);
    setSendFailed(false);
    const reply = await request(token, "/coming");
    setSending(false);
    if ("order" in reply) setOrder(reply.order);
    else setSendFailed(true);
  };

  const showProblem = problem !== null && (order === null || problem !== "offline");
  const open = phase === "open";
  const copy = order ? COPY[order.status] : null;
  const step = order ? STEPS.indexOf(order.status) : -1;

  return (
    <main
      ref={stageRef}
      className="qt-stage"
      data-phase={phase}
      data-status={order?.status}
      data-ringing={ringing}
    >
      <div className="qt-backdrop" aria-hidden />

      {showProblem ? (
        <div className="qt-problem">
          <div className="qt-title">{PROBLEMS[problem].tr}</div>
          <div className="qt-alt">{PROBLEMS[problem].en}</div>
        </div>
      ) : (
        <>
          <header className="qt-header">
            <span className="qt-store">{order?.storeName}</span>
            {order && problem === "offline" && <span className="qt-offline">Yeniden bağlanıyor…</span>}
          </header>

          <div className="qt-center">
            <div ref={cardRef} className="qt-card" data-shown={open || cardShown}>
              {order && copy && (
                <>
                  <div className="qt-label">Sipariş / Order</div>
                  <div className="qt-number">{order.orderNumber}</div>
                  <div className="qt-status" aria-live="polite">
                    {copy.tr}
                  </div>
                  <div className="qt-statusAlt">{copy.en}</div>
                  {step >= 0 && (
                    <ol className="qt-steps" aria-hidden>
                      {STEPS.map((s, i) => (
                        <li key={s} data-done={i <= step} />
                      ))}
                    </ol>
                  )}
                </>
              )}
            </div>
          </div>

          <footer className="qt-actions" data-shown={open}>
            {order && (order.status === "pending" || order.status === "preparing") && (
              <>
                <button className="qt-button" data-on={ringerOn} onClick={() => void toggleRinger()}>
                  <BellIcon on={ringerOn} />
                  {ringerOn ? "Zil açık · Ringer on" : "Zili aç · Turn ringer on"}
                </button>
                <p className="qt-hint">
                  {ringerNote === "blocked"
                    ? "Ses açılamadı. Telefonunuzun sesini kontrol edin. / Couldn't play sound. Check your phone's volume."
                    : ringerOn
                      ? ringerNote === "awake"
                        ? "Bu sayfa açık kalsın, hazır olunca çalacağız. / Keep this page open and we'll ring when it's ready."
                        : "Ekranı kapatmayın, hazır olunca çalacağız. / Keep the screen on and this page open; we'll ring when it's ready."
                      : "Siparişiniz hazır olunca telefonunuz çalsın. / Let your phone ring when your order is ready."}
                </p>
              </>
            )}

            {order?.status === "ready" && !order.coming && (
              <>
                <button className="qt-button qt-primary" disabled={sending} onClick={() => void imComing()}>
                  Geliyorum · I&apos;m coming
                </button>
                {ringing ? (
                  <button className="qt-link" onClick={() => setSilenced(true)}>
                    Sessize al · Silence
                  </button>
                ) : (
                  <p className="qt-hint">
                    {sendFailed
                      ? "Gönderilemedi, tekrar deneyin. / Couldn't send. Try again."
                      : "Mutfağa geldiğinizi haber verin. / Let the kitchen know you're on your way."}
                  </p>
                )}
              </>
            )}

            {order?.status === "ready" && order.coming && (
              <p className="qt-confirm" aria-live="polite">
                <CheckIcon />
                <span>
                  Mutfağa haber verildi
                  <small>The kitchen knows you&apos;re on your way</small>
                </span>
              </p>
            )}
          </footer>
        </>
      )}

      <canvas ref={canvasRef} className="qt-foil" aria-hidden />
    </main>
  );
}

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg className="qt-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      {!on && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="qt-icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  );
}
