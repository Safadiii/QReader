"use client";

import { useMemo } from "react";
import QRCode from "qrcode";
import "./display.css";

type Props = { value: string };

/** Cheap, stable pseudo-random in [0, 1) from an integer. */
const hash = (i: number) => (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296;

/**
 * Draws the QR as SVG so every module can animate in on its own.
 * Modules stay full-size squares with slightly soft corners: still easy for
 * phone cameras. The quiet zone comes from the card's padding.
 */
export function QrCode({ value }: Props) {
  const { size, cells, finders } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    const inFinder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

    const out: { x: number; y: number; delay: number }[] = [];
    const mid = (n - 1) / 2;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!data[y * n + x] || inFinder(x, y)) continue;
        // ripple outwards from the centre, with a little scatter
        const dist = Math.hypot(x - mid, y - mid) / (n * 0.71);
        out.push({ x, y, delay: Math.round(dist * 420 + hash(y * n + x) * 260) });
      }
    }
    return {
      size: n,
      cells: out,
      finders: [
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
      ] as const,
    };
  }, [value]);

  return (
    <svg
      className="qd-qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR code for this order"
    >
      {finders.map(([fx, fy], i) => (
        <g key={i} className="qd-finder" style={{ animationDelay: `${120 + i * 90}ms` }}>
          <path
            fillRule="evenodd"
            d={
              `M${fx + 1.7} ${fy}h3.6a1.7 1.7 0 0 1 1.7 1.7v3.6a1.7 1.7 0 0 1-1.7 1.7h-3.6a1.7 1.7 0 0 1-1.7-1.7v-3.6a1.7 1.7 0 0 1 1.7-1.7z` +
              `M${fx + 1.9} ${fy + 1}h3.2a.9.9 0 0 1 .9.9v3.2a.9.9 0 0 1-.9.9h-3.2a.9.9 0 0 1-.9-.9v-3.2a.9.9 0 0 1 .9-.9z`
            }
          />
          <rect x={fx + 2} y={fy + 2} width={3} height={3} rx={0.75} />
        </g>
      ))}
      {cells.map((c) => (
        <rect
          key={`${c.x}-${c.y}`}
          className="qd-module"
          x={c.x}
          y={c.y}
          width={1}
          height={1}
          rx={0.22}
          style={{ animationDelay: `${c.delay}ms` }}
        />
      ))}
    </svg>
  );
}
