"use client";

import { useCallback, useEffect, useState } from "react";
import type { AssetKind, Design } from "@/lib/design";
import { reloadTo } from "@/lib/navigate";

const errorText = (err: unknown) =>
  err instanceof Error && err.message !== "Failed to fetch" ? err.message : "Can't reach the server.";

async function call(url: string, init?: RequestInit): Promise<Design> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) reloadTo(`/login?next=${window.location.pathname}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body;
}

/** Loads the store's settings and keeps an editable draft of them. */
export function useSettings() {
  const [saved, setSaved] = useState<Design | null>(null);
  const [draft, setDraft] = useState<Design | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    call("/api/kitchen/settings")
      .then((settings) => {
        if (cancelled) return;
        setSaved(settings);
        setDraft(settings);
      })
      .catch((err) => !cancelled && setError(errorText(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback((patch: Partial<Design>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setJustSaved(false);
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      // store_id and assets are the server's to set.
      const { store_id: _id, assets: _assets, ...body } = draft;
      void _id;
      void _assets;
      const settings = await call("/api/kitchen/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(settings);
      setDraft(settings);
      setJustSaved(true);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }, [draft]);

  /** Images save at once; other unsaved edits in the draft are kept. */
  const setAsset = useCallback(async (kind: AssetKind, image: Blob | null) => {
    setBusy(true);
    setError(null);
    try {
      const settings = await call(
        `/api/kitchen/assets/${kind}`,
        image ? { method: "PUT", body: image } : { method: "DELETE" },
      );
      setSaved((s) => (s ? { ...s, assets: settings.assets } : s));
      setDraft((d) => (d ? { ...d, assets: settings.assets } : d));
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }, []);

  const dirty = saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft);
  return { draft, change, save, setAsset, error, busy, dirty, justSaved };
}
