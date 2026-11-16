import "./stampcard.css";

export type CardState = {
  enabled: boolean;
  goal: number;
  reward_name: string;
  code: string;
  /** Stamps that count and are not used up yet. */
  stamps: number;
  /** Stamps from orders claimed but not collected yet. */
  pending: number;
  reward_ready: boolean;
  rewards_redeemed: number;
  this_order: "pending" | "stamped" | "none";
  /** Sent back by the phone's own routes, so the page can refill its copy of the card secret. */
  device?: string;
  /** Saved to a phone number; only the end of it comes back, e.g. "+90 ••• 099". */
  phone_saved?: boolean;
  phone_hint?: string;
};

const CUP = "M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8zM17 10h1.5a2 2 0 0 1 0 4H17M9 3v2M13 3v2";
const GIFT = "M4 9h16v4H4zM6 13v7h12v-7M12 9v11M12 9C9 9 8 5.5 9.5 5S12 7.5 12 9zM12 9c3 0 4-3.5 2.5-4S12 7.5 12 9z";

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** 8 characters shown as K7F2-9QXM. */
export const prettyCode = (code: string) => (code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code);

/**
 * The customer's stamp card. It takes its colours from the page it sits on (--ink, --bg, --ok,
 * --line), so it suits every store's theme on the phone and the plain dashboard alike.
 */
export function StampCard({ card, lang = "en" }: { card: CardState; lang?: "tr" | "en" }) {
  const { goal, stamps, pending, reward_ready: ready } = card;
  const filled = Math.min(stamps, goal);
  const left = Math.max(goal - stamps, 0);
  // The stamps, then one more cell for the free reward. At most six to a row, in even rows.
  const cells = goal + 1;
  const rows = Math.ceil(cells / 6);
  const cols = Math.ceil(cells / rows);
  const say = (tr: string, en: string) => (lang === "tr" ? { main: tr, alt: en } : { main: en, alt: tr });

  const headline = ready
    ? say(`${card.reward_name} hazır!`, `${card.reward_name} is ready!`)
    : say(
        `${card.reward_name} için ${left} damga kaldı`,
        left === 1 ? `1 more stamp to ${card.reward_name}` : `${left} more stamps to ${card.reward_name}`,
      );

  const note = ready
    ? say("Kasada bu kartı gösterin", "Show this card to the cashier")
    : card.this_order === "pending"
      ? say("Siparişinizi alınca +1 damga", "+1 stamp when you pick up this order")
      : card.this_order === "stamped"
        ? say("Bu siparişin damgası eklendi", "Stamp added for this order")
        : null;

  return (
    <section className="sc-card" data-ready={ready} aria-label={lang === "tr" ? "Sadakat kartı" : "Loyalty card"}>
      <header className="sc-head">
        <span>{lang === "tr" ? "Sadakat kartı" : "Loyalty card"}</span>
        <b>
          {filled}/{goal}
        </b>
      </header>

      <ol className="sc-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cells }, (_, i) => {
          const last = i === goal;
          const state = last ? "off" : i < filled ? "on" : i === filled && card.this_order === "pending" ? "next" : "off";
          return (
            <li
              key={i}
              className="sc-stamp"
              data-state={state}
              data-last={last}
              data-new={card.this_order === "stamped" && i === filled - 1}
            >
              <Glyph d={last ? GIFT : CUP} />
            </li>
          );
        })}
      </ol>

      <div className="sc-text">
        <div className="sc-main">{headline.main}</div>
        <div className="sc-alt">{headline.alt}</div>
        {note && <div className="sc-note">{note.main}</div>}
      </div>

      <footer className="sc-foot">
        <span>
          {card.phone_saved
            ? `✓ ${lang === "tr" ? "Kayıtlı" : "Saved to"} ${card.phone_hint}`
            : lang === "tr"
              ? "Kart kodu · saklayın"
              : "Card code · keep it"}
        </span>
        <code>{prettyCode(card.code)}</code>
      </footer>
    </section>
  );
}
