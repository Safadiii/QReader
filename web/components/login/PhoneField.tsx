"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, DEFAULT_COUNTRY, countryByIso, flag, guessCountry, toInternational } from "@/lib/countries";

/**
 * Country picker plus number box. Reports the full +<code><number> value, so the
 * backend never has to guess the country.
 */
export function PhoneField({
  label,
  onChange,
  autoFocus,
}: {
  label: string;
  onChange: (international: string) => void;
  autoFocus?: boolean;
}) {
  const [iso, setIso] = useState(DEFAULT_COUNTRY);
  const [number, setNumber] = useState("");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const country = countryByIso(iso);

  // The browser's language is only known after the page loads.
  useEffect(() => {
    const id = setTimeout(() => setIso(guessCountry()), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    onChange(number.trim() ? toInternational(country, number) : "");
  }, [country, number, onChange]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, "");
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q) || c.iso.toLowerCase() === q);
  }, [query]);

  return (
    <div className="lg-field" ref={box}>
      <span>{label}</span>
      <div className="lg-phone">
        <button
          type="button"
          className="lg-country"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country: ${country.name} +${country.dial}`}
          onClick={() => {
            setQuery("");
            setOpen((o) => !o);
          }}
        >
          <span aria-hidden>{flag(country.iso)}</span>
          <span>+{country.dial}</span>
          <span aria-hidden className="lg-caret">▾</span>
        </button>
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="3 123 456"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
          autoFocus={autoFocus}
        />
        {open && (
          <div className="lg-list-wrap">
            <input
              className="lg-search"
              type="search"
              placeholder="Search country or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <ul className="lg-list" role="listbox">
              {shown.map((c) => (
                <li key={c.iso} role="option" aria-selected={c.iso === iso}>
                  <button
                    type="button"
                    onClick={() => {
                      setIso(c.iso);
                      setOpen(false);
                    }}
                  >
                    <span aria-hidden>{flag(c.iso)}</span>
                    <span className="lg-cname">{c.name}</span>
                    <span className="lg-dial">+{c.dial}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="lg-none">No country found</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
