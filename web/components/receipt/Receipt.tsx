import type { ReactNode } from "react";
import "./receipt.css";

/** The date and time printed on the slip, in the viewer's own clock. */
function stamp(date: Date) {
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return { day, time };
}

/**
 * The printer: a black slot at the top of the screen and the strip of space
 * below it where the slip comes out. Give the page a `--w` (the slip's width).
 * `fill` makes the strip cover the whole screen (the till); otherwise it only
 * takes the room the slip needs (the phone) so buttons can sit underneath.
 */
export function ReceiptPrinter({ fill = false, children }: { fill?: boolean; children?: ReactNode }) {
  return (
    <>
      <div className="rc-slot" aria-hidden />
      <div className="rc-feed" data-fill={fill}>
        {children}
      </div>
    </>
  );
}

type Props = {
  store: string;
  /** The store's own logo, instead of its name. */
  logo?: string | null;
  number: number;
  /** When it was printed. */
  when: Date | null;
  /** Tears off and falls away. */
  leaving?: boolean;
  /** Changes with the situation, for the page's own styling. */
  phase?: string;
  /** What goes between the date line and the closing line: the QR, or the status. */
  children?: ReactNode;
};

/** An order slip: black ink on white paper, torn at both ends. */
export function Receipt({ store, logo, number, when, leaving = false, phase, children }: Props) {
  const t = when ? stamp(when) : null;
  return (
    <div className="rc-paper" data-leaving={leaving} data-phase={phase}>
      <div className="rc-receipt">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- the store's own upload
          <img className="rc-logo" src={logo} alt={store} />
        ) : (
          <div className="rc-store">{store}</div>
        )}
        <div className="rc-sub">Sipariş fişi · Order slip</div>

        <hr className="rc-rule" />

        <div className="rc-numberLabel">Sipariş / Order</div>
        <div className="rc-number">{number}</div>

        <hr className="rc-rule" />

        <div className="rc-meta">
          <span>{t?.day}</span>
          <span>{t?.time}</span>
        </div>

        {children}

        <hr className="rc-rule" />

        <div className="rc-thanks">Teşekkürler · Thank you</div>
      </div>
    </div>
  );
}
