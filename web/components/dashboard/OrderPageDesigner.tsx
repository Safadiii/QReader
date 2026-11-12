"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LINK_KINDS,
  THEMES,
  assetUrl,
  designColors,
  type AssetKind,
  type Design,
  type ThemeName,
} from "@/lib/design";
import type { PreviewMessage } from "@/components/track/TrackView";
import { SaveBar } from "./SaveBar";
import { useSettings } from "./useSettings";
import "./forms.css";

type PreviewStatus = PreviewMessage["status"];

const STATUSES: { value: PreviewStatus; label: string }[] = [
  { value: "preparing", label: "Hazırlanıyor · Preparing" },
  { value: "ready", label: "Hazır · Ready" },
  { value: "collected", label: "Teslim · Collected" },
];

const UPLOADS: {
  kind: AssetKind;
  title: string;
  alt: string;
  help: string;
  maxWidth: number;
  maxHeight: number;
  type: "image/png" | "image/jpeg";
}[] = [
  { kind: "logo", title: "Logo", alt: "Logo", help: "Shown at the top instead of the venue name. A transparent PNG works best.", maxWidth: 512, maxHeight: 512, type: "image/png" },
  { kind: "background", title: "Arka plan fotoğrafı", alt: "Background photo", help: "Best as a portrait photo, 1080×1920. It is dimmed so text stays readable.", maxWidth: 1080, maxHeight: 1920, type: "image/jpeg" },
  { kind: "banner", title: "Afiş", alt: "Banner", help: "A photo or offer under the order, e.g. 1080×1080.", maxWidth: 1080, maxHeight: 1080, type: "image/jpeg" },
];

/** Shrinks a photo in the browser so uploads stay small and fast on phones. */
async function shrink(file: File, maxWidth: number, maxHeight: number, type: string): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))), type, 0.86),
  );
}

export function OrderPageDesigner() {
  const { draft, change, save, setAsset, error, busy, dirty, justSaved } = useSettings();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<PreviewStatus>("preparing");
  const [frameReady, setFrameReady] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /* The preview page says when it is listening; then every edit is sent to it. */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === "qreader-preview-ready") setFrameReady(true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!frameReady || !draft) return;
    const message: PreviewMessage = { type: "qreader-preview", design: draft, status };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, [frameReady, draft, status]);

  const upload = useCallback(
    async (item: (typeof UPLOADS)[number], file: File | undefined) => {
      if (!file) return;
      setUploadError(null);
      try {
        await setAsset(item.kind, await shrink(file, item.maxWidth, item.maxHeight, item.type));
      } catch {
        setUploadError("Bu görsel okunamadı · Couldn't read that image. Use a PNG or JPEG.");
      }
    },
    [setAsset],
  );

  const setLink = (d: Design, kind: keyof Design["links"], value: string) => {
    const links = { ...d.links };
    if (value) links[kind] = value;
    else delete links[kind];
    change({ links });
  };

  const colors = draft ? designColors(draft) : null;

  return (
    <div className="fm-page" data-wide="true">
      <h1 className="fm-title">Sipariş sayfası</h1>
      <div className="fm-sub">Order page · what customers see after scanning</div>

      {!draft && error && <div className="fm-notice">{error}</div>}

      {draft && colors && (
        <div className="od-layout">
          <div>
            <section className="fm-card">
              <h2>
                Görünüm <span>Looks</span>
              </h2>
              <div className="od-themes">
                {(Object.keys(THEMES) as ThemeName[]).map((name) => {
                  const t = THEMES[name];
                  return (
                    <button
                      key={name}
                      className="od-theme"
                      aria-pressed={draft.theme === name}
                      onClick={() =>
                        // A new look starts clean: drop the hand-picked colours.
                        change({ theme: name, brand_color: null, card_color: null, number_color: null })
                      }
                    >
                      <span className="od-swatch" style={{ background: t.bg }}>
                        <i style={{ background: t.card, color: t.number }}>57</i>
                        <b style={{ background: t.accent }} />
                      </span>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="fm-card">
              <h2>
                Renkler <span>Colours</span>
              </h2>
              <div className="od-colors">
                {(
                  [
                    ["brand_color", "Marka rengi · Brand colour", colors.accent],
                    ["card_color", "Kart rengi · Card colour", colors.card],
                    ["number_color", "Numara rengi · Number colour", colors.number],
                  ] as const
                ).map(([field, label, value]) => (
                  <label key={field} className="fm-field">
                    <span>{label}</span>
                    <span className="od-color">
                      <input type="color" value={value} onChange={(e) => change({ [field]: e.target.value })} />
                      <button
                        className="fm-ghost"
                        disabled={draft[field] === null}
                        onClick={(e) => {
                          e.preventDefault();
                          change({ [field]: null });
                        }}
                      >
                        Sıfırla · Reset
                      </button>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {UPLOADS.map((item) => {
              const url = assetUrl(draft, item.kind);
              return (
                <section key={item.kind} className="fm-card">
                  <h2>
                    {item.title} <span>{item.alt}</span>
                  </h2>
                  <p className="fm-help">{item.help}</p>
                  <div className="od-upload">
                    <div
                      className="od-thumb"
                      data-cover={item.kind !== "logo"}
                      style={url ? { backgroundImage: `url(${url})` } : undefined}
                    />
                    <label>
                      <input
                        className="od-file"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={busy}
                        onChange={(e) => {
                          void upload(item, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      <span className="od-pick">{url ? "Değiştir · Replace" : "Yükle · Upload"}</span>
                    </label>
                    {url && (
                      <button className="fm-ghost" disabled={busy} onClick={() => void setAsset(item.kind, null)}>
                        Kaldır · Remove
                      </button>
                    )}
                  </div>
                  {item.kind === "banner" && (
                    <label className="fm-field">
                      <span>Afişe dokununca açılacak bağlantı · Link opened when the banner is tapped</span>
                      <input
                        className="fm-input"
                        type="url"
                        inputMode="url"
                        placeholder="https://…"
                        value={draft.banner_url ?? ""}
                        onChange={(e) => change({ banner_url: e.target.value || null })}
                      />
                    </label>
                  )}
                </section>
              );
            })}
            {uploadError && <div className="fm-notice">{uploadError}</div>}

            <section className="fm-card">
              <h2>
                Bağlantılar <span>Your links</span>
              </h2>
              <p className="fm-help">Shown as buttons under the order. Leave a field empty to hide it.</p>
              <div className="fm-grid2">
                {LINK_KINDS.map((l) => (
                  <label key={l.kind} className="fm-field">
                    <span>{l.label}</span>
                    <input
                      className="fm-input"
                      type="url"
                      inputMode="url"
                      placeholder={l.placeholder}
                      value={draft.links[l.kind] ?? ""}
                      onChange={(e) => setLink(draft, l.kind, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <SaveBar dirty={dirty} busy={busy} justSaved={justSaved} error={error} onSave={() => void save()} />
          </div>

          <aside className="od-preview">
            <div className="fm-options">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  className="fm-option"
                  aria-pressed={status === s.value}
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="od-phone">
              <iframe ref={frameRef} src="/track/preview" title="Order page preview" />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
