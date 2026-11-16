"use client";

import { useCallback, useEffect, useState } from "react";
import "./forms.css";
import "./extras.css";
import { SaveBar } from "./SaveBar";
import { useLang } from "@/lib/i18n";
import { StampCard, prettyCode, type CardState } from "@/components/loyalty/StampCard";

type Program = { enabled: boolean; stamps_required: number; reward_name: string };
type Stats = {
  enabled: boolean;
  cards: number;
  stamps_given: number;
  stamps_pending: number;
  rewards_redeemed: number;
  rewards_waiting: number;
  cards_with_phone: number;
  new_cards_30d: number;
  recent: { code: string; reward_name: string; created_at: string; by: string | null }[];
};
type Found = CardState & { card_id: string };

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export function ExtrasView() {
  const { t, lang } = useLang();
  const [saved, setSaved] = useState<Program | null>(null);
  const [form, setForm] = useState<Program | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const loadStats = useCallback(async () => {
    const res = await fetch("/api/kitchen/loyalty/stats", { cache: "no-store" });
    if (res.ok) setStats(await res.json());
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/loyalty", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load.");
      const program = { enabled: body.enabled, stamps_required: body.stamps_required, reward_name: body.reward_name };
      setSaved(program);
      setForm(program);
      setError(null);
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, [loadStats]);

  useEffect(() => {
    // A timer, so the first load is not a state update inside the effect body.
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const dirty = !!saved && !!form && JSON.stringify(saved) !== JSON.stringify(form);

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kitchen/loyalty", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("Kaydedilemedi.", "Could not save."));
      const next = { enabled: body.enabled, stamps_required: body.stamps_required, reward_name: body.reward_name };
      setSaved(next);
      setForm(next);
      setJustSaved(true);
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Kaydedilemedi.", "Could not save."));
    }
    setBusy(false);
  };

  const goal = form?.stamps_required ?? 10;
  const sample: CardState = {
    enabled: true,
    goal,
    reward_name: form?.reward_name || t("Bedava kahve", "Free coffee"),
    code: "K7F29QXM",
    stamps: Math.min(6, goal - 1),
    pending: 1,
    reward_ready: false,
    rewards_redeemed: 0,
    this_order: "pending",
  };

  return (
    <div className="fm-page ex-page">
      <h1 className="fm-title">{t("Ekstra özellikler", "Extra features")}</h1>
      <p className="fm-sub">{t("Kafeniz için eklentiler", "Add-ons for your café")}</p>

      {error && <div className="fm-notice">{error}</div>}

      <section className="fm-card ex-feature">
        <header className="ex-head">
          <div>
            <h2>{t("Sadakat kartı", "Loyalty card")}</h2>
            <p className="fm-help">
              {t(
                "Müşteri her siparişte bir damga kazanır. Damgalar dolunca sıradaki kahve bedava.",
                "Customers earn a stamp with every order. When the card is full, the next coffee is free.",
              )}
            </p>
          </div>
          {form && (
            <label className="ex-switch">
              <input
                type="checkbox"
                role="switch"
                checked={form.enabled}
                onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                aria-label={t("Sadakat kartını aç", "Turn on the loyalty card")}
              />
              <span aria-hidden />
              <b>{form.enabled ? t("Açık", "On") : t("Kapalı", "Off")}</b>
            </label>
          )}
        </header>

        {form && (
          <div className="ex-body" data-off={!form.enabled}>
            <div className="ex-fields">
              <div className="fm-field">
                <span>{t("Ödül için gereken damga", "Stamps needed for the reward")}</span>
                <div className="ex-stepper">
                  <button
                    type="button"
                    className="fm-ghost"
                    aria-label={t("Azalt", "Fewer")}
                    disabled={form.stamps_required <= 3}
                    onClick={() => setForm({ ...form, stamps_required: form.stamps_required - 1 })}
                  >
                    −
                  </button>
                  <output aria-live="polite">{form.stamps_required}</output>
                  <button
                    type="button"
                    className="fm-ghost"
                    aria-label={t("Artır", "More")}
                    disabled={form.stamps_required >= 30}
                    onClick={() => setForm({ ...form, stamps_required: form.stamps_required + 1 })}
                  >
                    +
                  </button>
                </div>
              </div>

              <label className="fm-field">
                <span>{t("Ödül", "Reward")}</span>
                <input
                  className="fm-input"
                  value={form.reward_name}
                  maxLength={80}
                  placeholder={t("Bedava kahve", "Free coffee")}
                  onChange={(e) => setForm({ ...form, reward_name: e.target.value })}
                />
              </label>

              <ul className="ex-rules">
                <li>{t("Damga, sipariş “teslim edildi” olunca sayılır.", "A stamp counts once the order is marked collected.")}</li>
                <li>{t("Her sipariş yalnızca bir damga verir.", "Each order gives one stamp, once.")}</li>
                <li>{t("Kart müşterinin telefonunda durur; kayıt gerekmez.", "The card lives on the customer's phone; no sign-up.")}</li>
              </ul>
            </div>

            <div className="ex-preview">
              <span className="ex-label">{t("Müşterinin göreceği", "What customers see")}</span>
              <StampCard card={sample} lang={lang} />
            </div>
          </div>
        )}
      </section>

      {form?.enabled && saved?.enabled && stats && (
        <>
          <section className="ex-stats" aria-label={t("Sayılar", "Numbers")}>
            {[
              [t("Kart", "Cards"), stats.cards],
              [t("Verilen damga", "Stamps given"), stats.stamps_given],
              [t("Bekleyen ödül", "Rewards waiting"), stats.rewards_waiting],
              [t("Verilen ödül", "Rewards redeemed"), stats.rewards_redeemed],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </section>
          <p className="ex-foot">
            {t(
              `${stats.cards_with_phone} kart telefon numarasına kayıtlı · son 30 günde ${stats.new_cards_30d} yeni kart · ${stats.stamps_pending} damga teslim bekliyor`,
              `${stats.cards_with_phone} cards saved to a phone number · ${stats.new_cards_30d} new in the last 30 days · ${stats.stamps_pending} stamps waiting for pickup`,
            )}
          </p>

          <Redeem goal={saved.stamps_required} onDone={() => void loadStats()} />

          {stats.recent.length > 0 && (
            <section className="fm-card">
              <h2>{t("Son verilen ödüller", "Recent rewards")}</h2>
              <ul className="ex-recent">
                {stats.recent.map((r, i) => (
                  <li key={i}>
                    <code>{prettyCode(r.code)}</code>
                    <span>{r.reward_name}</span>
                    <small>
                      {when(r.created_at)}
                      {r.by ? ` · ${r.by}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} error={null} onSave={() => void save()} />
    </div>
  );
}

/** Look a card up by the code on the customer's phone, and give the reward. */
function Redeem({ goal, onDone }: { goal: number; onDone: () => void }) {
  const { t, lang } = useLang();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [note, setNote] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    setFound(null);
    try {
      const res = await fetch(`/api/kitchen/loyalty/cards/${encodeURIComponent(code.trim())}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote({ kind: "error", text: body.error ?? t("Kart bulunamadı.", "No card with that code.") });
      else setFound(body);
    } catch {
      setNote({ kind: "error", text: t("Sunucuya ulaşılamıyor.", "Can't reach the server.") });
    }
    setBusy(false);
  };

  const redeem = async () => {
    if (!found) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/kitchen/loyalty/cards/${encodeURIComponent(found.code)}/redeem`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setNote({ kind: "error", text: body.error ?? t("Verilemedi.", "Could not give the reward.") });
      else {
        setFound({ ...found, ...body });
        setNote({ kind: "ok", text: t(`${found.reward_name} verildi.`, `${found.reward_name} given.`) });
        onDone();
      }
    } catch {
      setNote({ kind: "error", text: t("Sunucuya ulaşılamıyor.", "Can't reach the server.") });
    }
    setBusy(false);
  };

  return (
    <section className="fm-card">
      <h2>{t("Ödül ver", "Give a reward")}</h2>
      <p className="fm-help">
        {t(
          "Müşterinin kart kodunu ya da telefon numarasını yazın. Sipariş kartında da “Ödül ver” düğmesi çıkar.",
          "Type the customer's card code or phone number. A “Give reward” button also appears on the order ticket.",
        )}
      </p>
      <form className="ex-find" onSubmit={(e) => void find(e)}>
        <input
          className="fm-input ex-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="K7F2-9QXM / +90 555…"
          maxLength={24}
          autoComplete="off"
          aria-label={t("Kart kodu", "Card code")}
        />
        <button className="fm-primary" type="submit" disabled={busy || code.replace(/[^A-Za-z0-9]/g, "").length < 7}>
          {t("Kartı bul", "Find card")}
        </button>
      </form>

      {note && (
        <p className="ex-note" data-kind={note.kind} role="status">
          {note.text}
        </p>
      )}

      {found && (
        <div className="ex-found">
          <StampCard card={{ ...found, goal: found.goal || goal }} lang={lang} />
          <button className="fm-primary" disabled={busy || !found.reward_ready} onClick={() => void redeem()}>
            {found.reward_ready
              ? t(`${found.reward_name} ver`, `Give ${found.reward_name}`)
              : t("Henüz yeterli damga yok", "Not enough stamps yet")}
          </button>
        </div>
      )}
    </section>
  );
}
