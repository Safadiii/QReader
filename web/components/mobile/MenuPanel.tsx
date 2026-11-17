"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./mobile.css";
import { useLang } from "@/lib/i18n";

type Item = { key: string; has_photo: boolean; id: string | null; category: string; name: string; description: string; price: string; available: boolean };
type Form = { enabled: boolean; currency: string; note: string; items: Item[] };

let counter = 0;
const newKey = () => `k${++counter}`;
const toPrice = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
const toCents = (v: string) => Math.max(0, Math.round((parseFloat(v.replace(",", ".")) || 0) * 100));
const snapshot = (f: Form | null) => (f ? JSON.stringify({ ...f, items: f.items.map(({ key: _k, ...rest }) => rest) }) : "");

export function MenuPanel() {
  const { t } = useLang();
  const [saved, setSaved] = useState<Form | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [ver, setVer] = useState<Record<string, number>>({});

  const fromBody = (b: {
    enabled: boolean;
    currency: string;
    note: string;
    items: { id: string; category: string; name: string; description: string; price_cents: number; available: boolean; has_photo?: boolean }[];
  }): Form => ({
    enabled: b.enabled,
    currency: b.currency,
    note: b.note,
    items: b.items.map((i) => ({
      key: newKey(),
      has_photo: Boolean(i.has_photo),
      id: i.id,
      category: i.category,
      name: i.name,
      description: i.description,
      price: toPrice(i.price_cents),
      available: i.available,
    })),
  });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen/menu", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not load.");
      const f = fromBody(body);
      setSaved(f);
      setForm(f);
      const l = await fetch("/api/menu-link", { cache: "no-store" });
      if (l.ok) setLink((await l.json()).url);
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : "Could not load." });
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [load]);

  const dirty = snapshot(saved) !== snapshot(form);
  const categories = useMemo(
    () => [...new Set((form?.items ?? []).map((i) => i.category.trim()).filter(Boolean))],
    [form?.items],
  );

  const save = async () => {
    if (!form) return;
    if (form.items.some((i) => !i.name.trim())) {
      setNote({ kind: "error", text: t("Her ürünün bir adı olmalı.", "Every item needs a name.") });
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/kitchen/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          currency: form.currency,
          note: form.note,
          items: form.items.map((i) => ({
            id: i.id,
            category: i.category,
            name: i.name,
            description: i.description,
            price_cents: toCents(i.price),
            available: i.available,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("Kaydedilemedi.", "Could not save."));
      const f = fromBody(body);
      setSaved(f);
      setForm(f);
      setNote({ kind: "ok", text: t("Kaydedildi", "Saved") });
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error ? e.message : t("Kaydedilemedi.", "Could not save.") });
    }
    setBusy(false);
  };

  const patch = (key: string, p: Partial<Item>) =>
    form && setForm({ ...form, items: form.items.map((i) => (i.key === key ? { ...i, ...p } : i)) });

  const add = (category = "") =>
    form &&
    setForm({
      ...form,
      items: [...form.items, { key: newKey(), has_photo: false, id: null, category, name: "", description: "", price: "", available: true }],
    });

  /** Shrinks a photo in the browser (max 900 px, JPEG) so uploads are small and fast. */
  const shrink = (file: File) =>
    new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("x"))), "image/jpeg", 0.82);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("x"));
      };
      img.src = url;
    });

  const setPhotoFlag = (id: string, has: boolean) => {
    const apply = (f: Form | null) => (f ? { ...f, items: f.items.map((i) => (i.id === id ? { ...i, has_photo: has } : i)) } : f);
    setSaved(apply);
    setForm(apply);
    setVer((v) => ({ ...v, [id]: (v[id] ?? 0) + 1 }));
  };

  const upload = async (item: Item, file: File) => {
    if (!item.id) return;
    setPhotoBusy(item.id);
    setNote(null);
    try {
      const blob = await shrink(file);
      const res = await fetch(`/api/kitchen/menu/items/${item.id}/photo`, { method: "PUT", body: blob });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("Fotoğraf yüklenemedi.", "Couldn't upload the photo."));
      setPhotoFlag(item.id, true);
    } catch (e) {
      setNote({
        kind: "error",
        text: e instanceof Error && e.message !== "x" ? e.message : t("Fotoğraf okunamadı. PNG, JPEG veya WebP deneyin.", "Couldn't read that photo. Try a PNG, JPEG or WebP."),
      });
    }
    setPhotoBusy(null);
  };

  const removePhoto = async (item: Item) => {
    if (!item.id) return;
    setPhotoBusy(item.id);
    const res = await fetch(`/api/kitchen/menu/items/${item.id}/photo`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setPhotoFlag(item.id, false);
    setPhotoBusy(null);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the field is selectable as a fallback */
    }
  };

  return (
    <section className="fm-card ex-feature mo">
      <header className="ex-head">
        <div>
          <h2>{t("Dijital menü", "Digital menu")}</h2>
          <p className="fm-help">
            {t(
              "Menünüzü telefonda gösterin. Müşteri QR’ı okutur, fiyatlara bakar. Kâğıt menü basmaya gerek yok.",
              "Show your menu on the customer's phone. They scan, browse, and see prices. No printing.",
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
              aria-label={t("Dijital menüyü aç", "Turn on the digital menu")}
            />
            <span aria-hidden />
            <b>{form.enabled ? t("Açık", "On") : t("Kapalı", "Off")}</b>
          </label>
        )}
      </header>

      {note?.kind === "error" && <div className="fm-notice">{note.text}</div>}

      {form && (
        <div className="mo-body" data-off={!form.enabled}>
          <div className="mn-link">
            <span className="ex-label">{t("Menü bağlantısı", "Menu link")}</span>
            <div className="mn-linkRow">
              <input className="sc-url fm-input" readOnly value={link ?? ""} aria-label={t("Menü bağlantısı", "Menu link")} onFocus={(e) => e.currentTarget.select()} />
              <button className="fm-ghost" disabled={!link} onClick={() => void copy()}>
                {copied ? t("Kopyalandı", "Copied") : t("Kopyala", "Copy")}
              </button>
              {link && form.enabled && !dirty && (
                <a className="fm-ghost mn-open" href={link} target="_blank" rel="noreferrer">
                  {t("Aç", "Open")}
                </a>
              )}
            </div>
          </div>

          <div className="mn-meta">
            <label className="fm-field mn-cur">
              <span>{t("Para birimi", "Currency")}</span>
              <input className="fm-input" value={form.currency} maxLength={4} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
            </label>
            <label className="fm-field">
              <span>{t("Menü notu (isteğe bağlı)", "Menu note (optional)")}</span>
              <input
                className="fm-input"
                value={form.note}
                maxLength={200}
                placeholder={t("Fiyatlara KDV dahildir.", "Prices include tax.")}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
          </div>

          <h3 className="mo-h">
            {t("Ürünler", "Items")} <small>{form.items.length}</small>
          </h3>

          {form.items.length === 0 && (
            <div className="mn-empty">
              <p>{t("Henüz ürün yok. İlk ürününüzü ekleyin.", "No items yet. Add your first one.")}</p>
              <div className="mn-quick">
                {[t("Sıcak içecekler", "Hot drinks"), t("Soğuk içecekler", "Cold drinks"), t("Tatlılar", "Desserts")].map((c) => (
                  <button key={c} type="button" className="fm-ghost" onClick={() => add(c)}>
                    + {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ul className="mn-items">
            {form.items.map((i) => (
              <li key={i.key} className="mn-item" data-off={!i.available}>
                <div className="mn-row">
                  <div className="mn-photo" data-has={i.has_photo}>
                    {i.has_photo && i.id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/kitchen/menu/items/${i.id}/photo?v=${ver[i.id] ?? 0}`} alt="" />
                    ) : null}
                    <label
                      className="mn-photoBtn"
                      title={i.id ? undefined : t("Önce menüyü kaydedin", "Save the menu first")}
                      data-disabled={!i.id || photoBusy === i.id}
                    >
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={!i.id || photoBusy === i.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void upload(i, f);
                        }}
                      />
                      {photoBusy === i.id ? "…" : i.has_photo ? t("Değiştir", "Change") : `+ ${t("Fotoğraf", "Photo")}`}
                    </label>
                    {i.has_photo && (
                      <button type="button" className="mn-photoDel" onClick={() => void removePhoto(i)} aria-label={t("Fotoğrafı kaldır", "Remove photo")}>
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    className="fm-input mn-name"
                    value={i.name}
                    maxLength={80}
                    placeholder={t("Ürün adı", "Item name")}
                    aria-label={t("Ürün adı", "Item name")}
                    onChange={(e) => patch(i.key, { name: e.target.value })}
                  />
                  <span className="mn-price">
                    <input
                      className="fm-input"
                      value={i.price}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={t("Fiyat", "Price")}
                      onChange={(e) => patch(i.key, { price: e.target.value.replace(/[^0-9.,]/g, "") })}
                    />
                    <em aria-hidden>{form.currency}</em>
                  </span>
                </div>
                <div className="mn-row">
                  <input
                    className="fm-input mn-cat"
                    value={i.category}
                    maxLength={40}
                    list="mn-cats"
                    placeholder={t("Kategori", "Category")}
                    aria-label={t("Kategori", "Category")}
                    onChange={(e) => patch(i.key, { category: e.target.value })}
                  />
                  <input
                    className="fm-input mn-desc"
                    value={i.description}
                    maxLength={200}
                    placeholder={t("Açıklama (isteğe bağlı)", "Description (optional)")}
                    aria-label={t("Açıklama", "Description")}
                    onChange={(e) => patch(i.key, { description: e.target.value })}
                  />
                </div>
                <div className="mn-actions">
                  <label className="mn-avail">
                    <input type="checkbox" checked={i.available} onChange={(e) => patch(i.key, { available: e.target.checked })} />
                    {i.available ? t("Satışta", "Available") : t("Tükendi", "Sold out")}
                  </label>
                  <button type="button" className="mn-del" onClick={() => setForm({ ...form, items: form.items.filter((x) => x.key !== i.key) })}>
                    {t("Sil", "Remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <datalist id="mn-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          {form.items.length > 0 && (
            <button type="button" className="fm-ghost mn-add" onClick={() => add(form.items[form.items.length - 1]?.category ?? "")}>
              + {t("Ürün ekle", "Add item")}
            </button>
          )}
        </div>
      )}

      <footer className="mo-foot">
        <span role="status" data-kind={note?.kind}>
          {dirty ? t("Kaydedilmemiş değişiklikler", "Unsaved changes") : note?.kind === "ok" ? note.text : ""}
        </span>
        <button className="fm-primary" disabled={!dirty || busy} onClick={() => void save()}>
          {t("Kaydet", "Save")}
        </button>
      </footer>
    </section>
  );
}
