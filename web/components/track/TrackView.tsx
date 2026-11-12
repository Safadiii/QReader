"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FoilScene } from "@/lib/foil/scene";
import { PANEL } from "@/lib/foil/textures";
import {
  LINK_KINDS,
  assetUrl,
  designStyle,
  fillTemplate,
  type Design,
  type Language,
} from "@/lib/design";
import { Ringer } from "@/lib/ringer";
import { currentPushState, enablePush, type PushState } from "@/lib/webpush";
import "./track.css";

type Status = "pending" | "preparing" | "ready" | "collected" | "cancelled";

type Order = {
  storeName: string;
  orderNumber: number;
  status: Status;
  /** Set once the customer has told the kitchen they are on their way. */
  coming: boolean;
  /** Changes each time staff tap "Ring again". */
  ringKey: string;
  /** The customer's own star rating, once given. */
  rating: number | null;
  design: Design;
};

/** What the dashboard's designer sends to the preview page. */
export type PreviewMessage = { type: "qreader-preview"; design: Design; status: Status };

type Problem = "invalid" | "expired" | "offline";
type Phase = "loading" | "arriving" | "open";
type FoilState = "pending" | "ready" | "none";

const POLL_MS = 3000;
/** The whole foil pouch may be at most this much of the screen's width. */
const FOIL_MAX_WIDTH = 0.82;
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

async function request(
  token: string,
  action: "" | "/scan" | "/coming" | "/rating",
  body?: unknown,
): Promise<Reply> {
  try {
    const res = await fetch(`/api/track/${encodeURIComponent(token)}${action}`, {
      method: action ? "POST" : "GET",
      cache: "no-store",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    if (res.ok) {
      const body = await res.json();
      return {
        order: {
          storeName: body.store_name,
          orderNumber: body.order_number,
          status: body.status,
          coming: body.customer_coming_at !== null,
          ringKey: body.ring_requested_at ?? "first",
          rating: body.rating,
          design: body.design,
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

type Props = {
  token: string;
  /** Inside the dashboard's designer: no backend, the design arrives by postMessage. */
  preview?: boolean;
};

export function TrackView({ token, preview = false }: Props) {
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
  /** The ring the customer has already answered or silenced, if any. */
  const [answered, setAnswered] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  /* Browser push: "unsupported" hides the button (e.g. an iPhone Safari tab). */
  const [pushState, setPushState] = useState<PushState>("unsupported");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFailed, setPushFailed] = useState(false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void currentPushState().then((s) => !cancelled && setPushState(s));
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const turnOnPush = async () => {
    setPushBusy(true);
    setPushFailed(false);
    try {
      setPushState(await enablePush(token));
    } catch {
      setPushFailed(true);
    }
    setPushBusy(false);
  };

  /* Preview: show whatever design the designer sends, with a sample order. */
  useEffect(() => {
    if (!preview) return;
    const onMessage = (e: MessageEvent<PreviewMessage>) => {
      if (e.origin !== window.location.origin || e.data?.type !== "qreader-preview") return;
      setOrder({
        storeName: e.data.design.name,
        orderNumber: 57,
        status: e.data.status,
        coming: false,
        ringKey: "first",
        rating: null,
        design: e.data.design,
      });
      setPhase("open");
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "qreader-preview-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, [preview]);

  /* Report the scan, then keep the status fresh. */
  useEffect(() => {
    if (preview) return;
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
  }, [token, preview]);

  /** Tells the 3D scene where the order card is, in stage pixels. */
  const syncLayout = useCallback(() => {
    const stage = stageRef.current;
    const card = cardRef.current;
    const foil = foilRef.current;
    if (!stage || !card || !foil) return;
    const s = stage.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    // The pouch is much wider than the panel it wraps. On a phone the full-size
    // card would need a pouch wider than the screen, so the card starts small
    // inside a pouch that fits and grows to full size as the foil opens.
    const full = card.offsetWidth;
    const wrapped = Math.min(full, s.width * FOIL_MAX_WIDTH * PANEL);
    stage.style.setProperty("--wrap-scale", String(wrapped / full));
    foil.setLayout({
      width: s.width,
      height: s.height,
      cx: c.left - s.left + c.width / 2,
      cy: c.top - s.top + c.height / 2,
      cardSize: wrapped,
    });
  }, []);

  /* Build the foil while the first status request is in flight. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || preview) return;
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
  }, [preview]);

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
  const ringing = ringerOn && order?.status === "ready" && order.ringKey !== answered;
  useEffect(() => {
    const ringer = ringerRef.current;
    if (!ringer) return;
    if (ringing) ringer.ring();
    else ringer.stop();
  }, [ringing]);

  useEffect(() => () => ringerRef.current?.dispose(), []);

  const toggleRinger = async () => {
    const ringer = (ringerRef.current ??= new Ringer(order?.design.alert_sound));
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

  const rate = async (stars: number) => {
    if (preview || !order) return;
    setOrder({ ...order, rating: stars }); // show it at once; the reply confirms it
    const reply = await request(token, "/rating", { stars });
    if ("order" in reply) setOrder(reply.order);
  };

  const imComing = async () => {
    if (preview) return;
    setAnswered(order?.ringKey ?? null);
    setSending(true);
    setSendFailed(false);
    const reply = await request(token, "/coming");
    setSending(false);
    if ("order" in reply) setOrder(reply.order);
    else setSendFailed(true);
  };

  const showProblem = problem !== null && (order === null || problem !== "offline");
  const open = phase === "open";
  const step = order ? STEPS.indexOf(order.status) : -1;
  const design = order?.design;
  // The store's language is shown large, the other one small underneath.
  const lang: Language = design?.default_language ?? "tr";
  const other: Language = lang === "tr" ? "en" : "tr";
  const say = (tr: string, en: string) => (lang === "tr" ? `${tr} · ${en}` : `${en} · ${tr}`);

  let copy: { main: string; alt: string } | null = null;
  if (order && design) {
    const base = COPY[order.status];
    copy = { main: base[lang], alt: base[other] };
    if (order.status === "ready") {
      // The store's own alert wording, when it has set one.
      const fill = (text: string | null, fallback: string) =>
        text ? fillTemplate(text, order.orderNumber, order.storeName) : fallback;
      const mine = {
        tr: { title: design.alert_title_tr, text: design.alert_text_tr },
        en: { title: design.alert_title_en, text: design.alert_text_en },
      };
      copy = {
        main: fill(mine[lang].title, copy.main),
        alt: fill(mine[lang].text ?? mine[other].title, copy.alt),
      };
    }
  }
  const logo = design ? assetUrl(design, "logo") : null;
  const photo = design ? assetUrl(design, "background") : null;
  const banner = design ? assetUrl(design, "banner") : null;
  const links = design ? LINK_KINDS.filter((l) => design.links[l.kind]) : [];
  const reviewUrl =
    design?.google_review_url && order?.rating && order.rating >= design.google_min_stars
      ? design.google_review_url
      : null;

  return (
    <main
      ref={stageRef}
      className="qt-stage"
      data-phase={phase}
      data-status={order?.status}
      data-ringing={ringing}
      style={design ? designStyle(design) : undefined}
    >
      {photo && <div className="qt-photo" style={{ backgroundImage: `url(${photo})` }} aria-hidden />}
      <div className="qt-backdrop" aria-hidden />

      {showProblem ? (
        <div className="qt-problem">
          <div className="qt-title">{PROBLEMS[problem].tr}</div>
          <div className="qt-alt">{PROBLEMS[problem].en}</div>
        </div>
      ) : (
        <>
          <header className="qt-header">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the store's own upload
              <img className="qt-logo" src={logo} alt={order?.storeName ?? ""} />
            ) : (
              <span className="qt-store">{order?.storeName}</span>
            )}
            {order && problem === "offline" && <span className="qt-offline">Yeniden bağlanıyor…</span>}
          </header>

          <div className="qt-center">
            <div ref={cardRef} className="qt-card" data-shown={open || cardShown}>
              {order && copy && (
                <>
                  <div className="qt-label">Sipariş / Order</div>
                  <div className="qt-number">{order.orderNumber}</div>
                  <div className="qt-status" aria-live="polite">
                    {copy.main}
                  </div>
                  <div className="qt-statusAlt">{copy.alt}</div>
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
                {pushState !== "unsupported" && (
                  <>
                    <button
                      className="qt-button"
                      data-on={pushState === "on"}
                      disabled={pushBusy || pushState === "on" || pushState === "denied"}
                      onClick={() => void turnOnPush()}
                    >
                      <BellIcon on={pushState === "on"} />
                      {pushState === "on"
                        ? say("Bildirim açık", "Notifications on")
                        : say("Bildirim al", "Notify me")}
                    </button>
                    {(pushState === "denied" || pushFailed || pushState === "on") && (
                      <p className="qt-hint">
                        {pushState === "denied"
                          ? "Bildirimler engellendi. Tarayıcı ayarlarından izin verin. / Notifications are blocked. Allow them in your browser settings."
                          : pushFailed
                            ? "Bildirim açılamadı, tekrar deneyin. / Couldn't turn on notifications. Try again."
                            : "Ekran kilitliyken de haber vereceğiz. / We'll alert you even when the screen is locked."}
                      </p>
                    )}
                  </>
                )}
                <button className="qt-button" data-on={ringerOn} onClick={() => void toggleRinger()}>
                  <BellIcon on={ringerOn} />
                  {ringerOn ? say("Zil açık", "Ringer on") : say("Zili aç", "Turn ringer on")}
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
                  {say("Geliyorum", "I'm coming")}
                </button>
                {ringing ? (
                  <button className="qt-link" onClick={() => setAnswered(order.ringKey)}>
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
              <>
                <p className="qt-confirm" aria-live="polite">
                  <CheckIcon />
                  <span>
                    Mutfağa haber verildi
                    <small>The kitchen knows you&apos;re on your way</small>
                  </span>
                </p>
                {ringing && (
                  <button className="qt-link" onClick={() => setAnswered(order.ringKey)}>
                    Sessize al · Silence
                  </button>
                )}
              </>
            )}

            {order?.status === "collected" && design?.ask_rating && (
              <div className="qt-rate">
                <div className="qt-rateTitle">
                  {order.rating ? say("Teşekkürler!", "Thank you!") : say("Nasıldı?", "How was it?")}
                </div>
                <div className="qt-stars" role="group" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      className="qt-star"
                      data-on={(order.rating ?? 0) >= n}
                      aria-label={`${n} / 5`}
                      aria-pressed={order.rating === n}
                      onClick={() => void rate(n)}
                    >
                      ★
                    </button>
                  ))}
                </div>
                {reviewUrl && (
                  <a className="qt-button qt-primary" href={reviewUrl} target="_blank" rel="noreferrer">
                    {say("Google'da değerlendir", "Review us on Google")}
                  </a>
                )}
              </div>
            )}
          </footer>

          {open && design && (
            <div className="qt-extras">
              {banner &&
                (design.banner_url ? (
                  <a className="qt-banner" href={design.banner_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the store's own upload */}
                    <img src={banner} alt="" />
                  </a>
                ) : (
                  <div className="qt-banner">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the store's own upload */}
                    <img src={banner} alt="" />
                  </div>
                ))}
              {links.length > 0 && (
                <nav className="qt-links" aria-label="Links">
                  {links.map((l) => (
                    <a key={l.kind} href={design.links[l.kind]} target="_blank" rel="noreferrer">
                      {l.label}
                    </a>
                  ))}
                </nav>
              )}
            </div>
          )}
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
