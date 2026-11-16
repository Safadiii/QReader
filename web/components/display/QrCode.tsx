"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

type Props = { value: string };

/**
 * The QR as one black SVG path of square modules: crisp at any size, and plain
 * enough for any phone camera. The quiet zone comes from the receipt's padding.
 */
export function QrCode({ value }: Props) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.data[y * n + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [value]);

  return (
    <svg
      className="qd-qr"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for this order"
    >
      <path d={path} />
    </svg>
  );
}
