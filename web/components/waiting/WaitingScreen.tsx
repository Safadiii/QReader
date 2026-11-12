"use client";

import { useEffect, useRef, useState } from "react";
import "./waiting.css";
import { reloadTo } from "@/lib/navigate";

type Entry = { id: string; number: number; ring: string | null };
type Board = { ready: Entry[]; preparing: Entry[] };

const POLL_MS = 2000;
/** How long a newly ready number stays highlighted. */
const FRESH_MS = 12000;

/** One call per order per ring: "ring again" calls the number out again. */
const callKey = (e: Entry) => `${e.id}:${e.ring ?? ""}`;

function callOut(number: number) {
  if (!("speechSynthesis" in window)) return;
  const say = (text: string, lang: string) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };
  say(`Sipariş ${number} hazır`, "tr-TR");
  say(`Order ${number} is ready`, "en-US");
}

export function WaitingScreen() {
  const [board, setBoard] = useState<Board | null>(null);
  const [offline, setOffline] = useState(false);
  const [voice, setVoice] = useState(false);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const called = useRef<Set<string> | null>(null);
  const voiceRef = useRef(false);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/waiting", { cache: "no-store" });
        if (res.status === 401) reloadTo("/login?next=/waiting");
        if (!res.ok) throw new Error();
        const next = (await res.json()) as Board;
        if (stopped) return;
        setBoard(next);
        setOffline(false);

        const keys = next.ready.map(callKey);
        if (called.current === null) {
          // First load: don't call out orders that were already waiting.
          called.current = new Set(keys);
          return;
        }
        const news = next.ready.filter((e) => !called.current!.has(callKey(e)));
        if (news.length === 0) return;
        for (const e of news) {
          called.current.add(callKey(e));
          if (voiceRef.current) callOut(e.number);
        }
        const ids = news.map((e) => e.id);
        setFresh((old) => new Set([...old, ...ids]));
        setTimeout(() => {
          setFresh((old) => new Set([...old].filter((id) => !ids.includes(id))));
        }, FRESH_MS);
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  const toggleVoice = () => {
    const on = !voice;
    setVoice(on);
    voiceRef.current = on;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    if (on) {
      // Browsers only allow speech after a tap: this also proves it works.
      const u = new SpeechSynthesisUtterance("Ses açık");
      u.lang = "tr-TR";
      window.speechSynthesis.speak(u);
    }
  };

  return (
    <main className="wt-page">
      <section className="wt-ready">
        <h1 className="wt-heading">
          Hazır <span>Ready</span>
        </h1>
        {board && board.ready.length === 0 && (
          <p className="wt-empty">Şu an hazır sipariş yok · No orders ready right now</p>
        )}
        <ul className="wt-numbers" aria-live="polite">
          {board?.ready.map((e) => (
            <li key={e.id} data-fresh={fresh.has(e.id)}>
              {e.number}
            </li>
          ))}
        </ul>
      </section>

      <section className="wt-preparing">
        <h2 className="wt-heading">
          Hazırlanıyor <span>Preparing</span>
        </h2>
        <ul className="wt-small">
          {board?.preparing.map((e) => (
            <li key={e.id}>{e.number}</li>
          ))}
        </ul>
      </section>

      <footer className="wt-foot">
        {offline && <span className="wt-offline">Bağlantı bekleniyor · Reconnecting…</span>}
        <button className="wt-voice" data-on={voice} onClick={toggleVoice} aria-pressed={voice}>
          {voice ? "Sesli anons açık · Voice on" : "Sesli anonsu aç · Turn voice on"}
        </button>
      </footer>
    </main>
  );
}
