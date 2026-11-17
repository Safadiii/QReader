"use client";

import { useRef } from "react";
import "./plate.css";
import { formatPlate, isValidPlate, joinPlate, onlyPlateLetters, splitPlate } from "./plate";

/** A Turkish number plate, to look at: blue band with TR, black type on white. */
export function TurkishPlate({ value, size = "md" }: { value: string; size?: "sm" | "md" | "lg" }) {
  const text = formatPlate(value);
  return (
    <div className="tp" data-size={size} role="img" aria-label={text || "Plate"}>
      <span className="tp-band" aria-hidden>
        <i />
        TR
      </span>
      <span className="tp-text" data-empty={!text}>
        {text || "34 ABC 123"}
      </span>
    </div>
  );
}

/** The same plate, but the three parts of it are the fields the customer types into. */
export function PlateInput({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string;
  onChange: (plate: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const p = splitPlate(value);
  const letters = useRef<HTMLInputElement>(null);
  const digits = useRef<HTMLInputElement>(null);
  const province = useRef<HTMLInputElement>(null);
  const valid = isValidPlate(value);

  return (
    <div className="tp tp-input" data-size="lg" data-valid={valid} role="group" aria-label={label}>
      <span className="tp-band" aria-hidden>
        <i />
        TR
      </span>
      <div className="tp-fields">
        <input
          ref={province}
          className="tp-f tp-f-p"
          value={p.province}
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          placeholder="34"
          disabled={disabled}
          aria-label="Province code"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            onChange(joinPlate({ ...p, province: v }));
            if (v.length === 2) letters.current?.focus();
          }}
        />
        <input
          ref={letters}
          className="tp-f tp-f-l"
          value={p.letters}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={3}
          placeholder="ABC"
          disabled={disabled}
          aria-label="Letters"
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !p.letters) province.current?.focus();
          }}
          onChange={(e) => {
            const v = onlyPlateLetters(e.target.value).slice(0, 3);
            onChange(joinPlate({ ...p, letters: v }));
            if (v.length === 3) digits.current?.focus();
          }}
        />
        <input
          ref={digits}
          className="tp-f tp-f-d"
          value={p.digits}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="123"
          disabled={disabled}
          aria-label="Numbers"
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !p.digits) letters.current?.focus();
          }}
          onChange={(e) => onChange(joinPlate({ ...p, digits: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
        />
      </div>
    </div>
  );
}
