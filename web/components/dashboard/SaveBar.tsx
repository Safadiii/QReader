"use client";

type Props = { dirty: boolean; busy: boolean; justSaved: boolean; error: string | null; onSave: () => void };

/** Sticks to the bottom of a settings form. */
export function SaveBar({ dirty, busy, justSaved, error, onSave }: Props) {
  return (
    <div className="fm-save">
      <span className="fm-saveNote" role="status" data-kind={error ? "error" : undefined}>
        {error ?? (justSaved && !dirty ? "Kaydedildi · Saved" : dirty ? "Kaydedilmemiş değişiklikler · Unsaved changes" : "")}
      </span>
      <button className="fm-primary" disabled={!dirty || busy} onClick={onSave}>
        Kaydet · Save changes
      </button>
    </div>
  );
}
