"use client";

import type { AlertSound, Language } from "@/lib/design";
import { previewSound } from "@/lib/ringer";
import { SaveBar } from "./SaveBar";
import { useSettings } from "./useSettings";
import "./forms.css";

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
];

const SOUNDS: { value: AlertSound; label: string }[] = [
  { value: "pager", label: "Pager" },
  { value: "marimba", label: "Marimba" },
  { value: "crystal", label: "Crystal" },
  { value: "classic", label: "Classic" },
];

export function SettingsForm() {
  const { draft, change, save, error, busy, dirty, justSaved } = useSettings();

  return (
    <div className="fm-page">
      <h1 className="fm-title">Ayarlar</h1>
      <div className="fm-sub">Settings</div>

      {!draft && error && <div className="fm-notice">{error}</div>}

      {draft && (
        <>
          <section className="fm-card">
            <h2>
              Mekan <span>Venue</span>
            </h2>
            <label className="fm-field">
              <span>Mekan adı · Venue name</span>
              <input
                className="fm-input"
                maxLength={150}
                value={draft.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <div className="fm-field">
              <span>Müşteri dili · Default customer language</span>
              <div className="fm-options">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.value}
                    className="fm-option"
                    aria-pressed={draft.default_language === l.value}
                    onClick={() => change({ default_language: l.value })}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="fm-card">
            <h2>
              Uyarı sesi <span>Alert sound</span>
            </h2>
            <p className="fm-help">
              What rings on the customer&apos;s phone when their order is ready. Tap one to hear it.
            </p>
            <div className="fm-options">
              {SOUNDS.map((s) => (
                <button
                  key={s.value}
                  className="fm-option"
                  aria-pressed={draft.alert_sound === s.value}
                  onClick={() => {
                    previewSound(s.value);
                    change({ alert_sound: s.value });
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <section className="fm-card">
            <h2>
              Uyarı metni <span>Alert text</span>
            </h2>
            <p className="fm-help">
              Shown on the customer&apos;s phone when the order is ready. Leave empty for ours. You can
              use {"{number}"} and {"{venue}"}.
            </p>
            <div className="fm-grid2">
              <label className="fm-field">
                <span>Başlık (Türkçe) · Title (Turkish)</span>
                <input
                  className="fm-input"
                  maxLength={120}
                  placeholder="Hazır!"
                  value={draft.alert_title_tr ?? ""}
                  onChange={(e) => change({ alert_title_tr: e.target.value || null })}
                />
              </label>
              <label className="fm-field">
                <span>Metin (Türkçe) · Text (Turkish)</span>
                <input
                  className="fm-input"
                  maxLength={200}
                  placeholder="Sipariş {number} tezgahta"
                  value={draft.alert_text_tr ?? ""}
                  onChange={(e) => change({ alert_text_tr: e.target.value || null })}
                />
              </label>
              <label className="fm-field">
                <span>Title (English)</span>
                <input
                  className="fm-input"
                  maxLength={120}
                  placeholder="Ready!"
                  value={draft.alert_title_en ?? ""}
                  onChange={(e) => change({ alert_title_en: e.target.value || null })}
                />
              </label>
              <label className="fm-field">
                <span>Text (English)</span>
                <input
                  className="fm-input"
                  maxLength={200}
                  placeholder="Order {number} is at the counter"
                  value={draft.alert_text_en ?? ""}
                  onChange={(e) => change({ alert_text_en: e.target.value || null })}
                />
              </label>
            </div>
          </section>

          <section className="fm-card">
            <h2>
              Teslimden sonra puan <span>Rating after pickup</span>
            </h2>
            <label className="fm-check">
              <input
                type="checkbox"
                checked={draft.ask_rating}
                onChange={(e) => change({ ask_rating: e.target.checked })}
              />
              Müşteriye nasıl olduğunu sor · Ask customers how it went
            </label>
            <label className="fm-field">
              <span>Google yorum bağlantısı · Google review link</span>
              <input
                className="fm-input"
                type="url"
                inputMode="url"
                placeholder="https://g.page/r/…/review"
                value={draft.google_review_url ?? ""}
                onChange={(e) => change({ google_review_url: e.target.value || null })}
              />
            </label>
            <div className="fm-field">
              <span>Şu puandan itibaren Google&apos;a yönlendir · Send to Google from rating</span>
              <div className="fm-options">
                {[5, 4, 3].map((n) => (
                  <button
                    key={n}
                    className="fm-option"
                    aria-pressed={draft.google_min_stars === n}
                    onClick={() => change({ google_min_stars: n })}
                  >
                    ★ {n}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} error={error} onSave={() => void save()} />
        </>
      )}
    </div>
  );
}
