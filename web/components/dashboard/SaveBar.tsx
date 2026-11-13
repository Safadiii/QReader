"use client";

import { useLang } from "@/lib/i18n";

type Props = { dirty: boolean; busy: boolean; justSaved: boolean; error: string | null; onSave: () => void };

/** Sticks to the bottom of a settings form. */
export function SaveBar({ dirty, busy, justSaved, error, onSave }: Props) {
  const { t } = useLang();
  return (
    <div className="fm-save">
      <span className="fm-saveNote" role="status" data-kind={error ? "error" : undefined}>
        {error ??
          (justSaved && !dirty
            ? t("Kaydedildi", "Saved")
            : dirty
              ? t("Kaydedilmemiş değişiklikler", "Unsaved changes")
              : "")}
      </span>
      <button className="fm-primary" disabled={!dirty || busy} onClick={onSave}>
        {t("Değişiklikleri kaydet", "Save changes")}
      </button>
    </div>
  );
}