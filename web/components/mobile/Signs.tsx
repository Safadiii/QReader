"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QrCode } from "@/components/display/QrCode";
import "@/components/display/display.css";

type Step = { tr: string; en: string };

/** A printable sign: store name, a headline, a QR, and what to do. Used on screen and for printing. */
export function Sign({
  store,
  title,
  sub,
  big,
  url,
  steps,
}: {
  store: string;
  title: string;
  sub: string;
  /** A large line above the title, like "Table 5". */
  big?: string;
  url: string | null;
  steps: Step[];
}) {
  return (
    <div className="cp-sheet">
      <div className="cp-store">{store}</div>
      {big && <div className="cp-big">{big}</div>}
      <div className="cp-title">{title}</div>
      <div className="cp-sub">{sub}</div>
      <div className="cp-qr">{url ? <QrCode value={url} /> : null}</div>
      <ol className="cp-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <b>{i + 1}</b>
            <span>
              {s.tr}
              <i>{s.en}</i>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Prints what `children` renders, and nothing else on the page. The content is mounted at the end of
 * <body> only while printing; `body.printing-sign` hides every other part of the page for the print.
 */
export function PrintJob({ active, onDone, children }: { active: boolean; onDone: () => void; children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const el = document.createElement("div");
    el.className = "print-root";
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, [active]);

  useEffect(() => {
    if (!active || !host) return;
    document.body.classList.add("printing-sign");
    const finish = () => {
      document.body.classList.remove("printing-sign");
      window.removeEventListener("afterprint", finish);
      onDone();
    };
    window.addEventListener("afterprint", finish);
    // Let the sheet paint (and the QR draw) before the print dialog opens.
    const id = setTimeout(() => window.print(), 250);
    return () => {
      clearTimeout(id);
      window.removeEventListener("afterprint", finish);
      document.body.classList.remove("printing-sign");
    };
  }, [active, host, onDone]);

  return host ? createPortal(children, host) : null;
}
