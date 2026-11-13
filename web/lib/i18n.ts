"use client";

import { useEffect, useSyncExternalStore } from "react";

export type Lang = "tr" | "en";

const KEY = "qreader-lang";
const listeners = new Set<() => void>();
let current: Lang = "tr";
let started = false;

const isLang = (v: unknown): v is Lang => v === "tr" || v === "en";

/** Switches every screen at once. Called after settings load or save. */
export function setLanguage(next: Lang) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage can be unavailable; the setting itself is the source of truth */
  }
  listeners.forEach((fn) => fn());
}

/** Once per page load: use the last known language right away, then confirm it from the settings. */
function start() {
  if (started) return;
  started = true;
  try {
    const stored = localStorage.getItem(KEY);
    if (isLang(stored)) setLanguage(stored);
  } catch {
    /* ignore */
  }
  fetch("/api/kitchen/settings", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (isLang(body?.default_language)) setLanguage(body.default_language);
    })
    .catch(() => {});
}

/** Same as `t`, for plain functions outside React (e.g. error messages built at call time). */
export const tt = (tr: string, en: string) => (current === "tr" ? tr : en);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** `t(turkish, english)` returns the text in the venue's selected language. */
export function useLang() {
  const lang = useSyncExternalStore(subscribe, () => current, () => "tr" as Lang);
  useEffect(start, []);
  const t = (tr: string, en: string) => (lang === "tr" ? tr : en);
  return { lang, t };
}