"use client";

import "./cardetails.css";
import { CAR_COLORS } from "./colors";

/** Colour, model and spot: what makes the car easy to find. Used wherever a customer picks "to my car". */
export function CarDetails({
  lang,
  color,
  model,
  note,
  onChange,
}: {
  lang: "tr" | "en";
  color: string;
  model: string;
  note: string;
  onChange: (next: { color: string; model: string; note: string }) => void;
}) {
  const T = {
    color: lang === "tr" ? "Araç rengi" : "Car colour",
    model: lang === "tr" ? "Marka / model (ör. Renault Clio)" : "Make / model (e.g. Renault Clio)",
    note: lang === "tr" ? "Park yeri (ör. ağacın yanında)" : "Where you're parked (e.g. by the tree)",
  };
  return (
    <div className="cd">
      <span className="cd-label">{T.color}</span>
      <div className="cd-colors" role="radiogroup" aria-label={T.color}>
        {CAR_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={color === c.key}
            aria-label={c[lang]}
            title={c[lang]}
            data-on={color === c.key}
            style={{ ["--sw" as string]: c.hex }}
            onClick={() => onChange({ color: color === c.key ? "" : c.key, model, note })}
          />
        ))}
      </div>
      <input
        className="cd-input"
        value={model}
        maxLength={40}
        placeholder={T.model}
        onChange={(e) => onChange({ color, model: e.target.value, note })}
      />
      <input
        className="cd-input"
        value={note}
        maxLength={60}
        placeholder={T.note}
        onChange={(e) => onChange({ color, model, note: e.target.value })}
      />
    </div>
  );
}
