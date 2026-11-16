import type { CSSProperties } from "react";
import "./ordernumber.css";

export type BodyStatus = "pending" | "preparing" | "ready" | "collected" | "cancelled";

/** An order number: plain digits, coloured by where the order is. */
export function OrderNumber({
  value,
  status,
  size = 84,
}: {
  value: number;
  status: BodyStatus;
  /** Pixels, or any CSS length such as "100%". */
  size?: number | string;
}) {
  const style = { "--on-size": typeof size === "number" ? `${size}px` : size } as CSSProperties;
  return (
    <span className="on" data-status={status} data-long={String(value).length > 3} style={style}>
      {value}
    </span>
  );
}
