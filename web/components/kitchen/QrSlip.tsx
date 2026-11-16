"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Receipt, ReceiptPrinter } from "@/components/receipt/Receipt";
import { QrCode } from "@/components/display/QrCode";
import { tt } from "@/lib/i18n";
import "@/components/display/display.css";
import "./qrslip.css";

type Props = {
  orderId: string;
  number: number;
  store: string;
  printedAt: string;
  /** Where on screen it opens from (the button that was pressed); it shrinks back there. */
  origin?: { x: number; y: number };
  onClose: () => void;
};

/** An order's QR on a slip, big enough to show across the counter. */
export function QrSlip({ orderId, number, store, printedAt, origin, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => {
    // No motion wanted: leave at once. Otherwise play the shrink, then leave.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onClose();
    else {
      setClosing(true);
      setTimeout(onClose, 240); // as long as the shrink; a timer, so it can never hang
    }
  }, [onClose]);

  /* Open like an app on a Mac: grow out of the button that was pressed. */
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el || !origin) return;
    // The backdrop centres the window, and unlike the window it is never transformed.
    const r = (el.parentElement ?? el).getBoundingClientRect();
    el.style.setProperty("--dx", `${origin.x - (r.left + r.width / 2)}px`);
    el.style.setProperty("--dy", `${origin.y - (r.top + r.height / 2)}px`);
  }, [origin]);

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    fetch(`/api/kitchen/orders/${orderId}/qr`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? tt("QR yüklenemedi.", "Can't load the QR."));
        if (!stopped) setUrl(body.trackingUrl);
      })
      .catch((err: Error) => !stopped && setError(err.message));
    return () => {
      stopped = true;
    };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="qs-back" data-closing={closing} role="dialog" aria-modal="true" aria-label={tt(`Sipariş ${number} QR`, `Order ${number} QR`)} onClick={close}>
      <div
        ref={stageRef}
        className="qs-stage"
        data-closing={closing}
        onClick={(e) => e.stopPropagation()}
      >
        <ReceiptPrinter>
          <Receipt store={store} number={number} when={new Date(printedAt)}>
            <div className="qd-qrBox">
              {url ? (
                <QrCode value={url} />
              ) : (
                <div className="qs-wait">{error ?? tt("Yükleniyor…", "Loading…")}</div>
              )}
            </div>
            <div className="qd-prompt">Okutun, siparişiniz hazır olunca haber verelim</div>
            <div className="qd-promptAlt">Scan and we&apos;ll buzz you when it&apos;s ready</div>
          </Receipt>
        </ReceiptPrinter>
        <button className="qs-close" onClick={close}>
          {tt("Kapat", "Close")}
        </button>
      </div>
    </div>
  );
}
