"use client";

import { useEffect, useState } from "react";
import { DisplayScreen } from "@/components/display/DisplayScreen";
import { WaitingScreen } from "@/components/waiting/WaitingScreen";

type Target = { kind: "display" | "waiting"; storeName: string };

/** A screen opened from its own link (iPad at the till, TV in the shop): no sign-in needed. */
export function ScreenByToken({ token }: { token: string }) {
  const [target, setTarget] = useState<Target | "invalid" | null>(null);

  useEffect(() => {
    let stopped = false;
    fetch(`/api/screen/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as Target) : res.status === 404 ? "invalid" : null))
      .then((next) => !stopped && setTarget(next))
      .catch(() => !stopped && setTarget(null));
    return () => {
      stopped = true;
    };
  }, [token]);

  if (target === "invalid") {
    return (
      <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 600 }}>Bu bağlantı artık geçerli değil</h1>
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            This link is no longer valid. Ask the owner for the new one.
          </p>
        </div>
      </main>
    );
  }
  if (!target) return null;
  return target.kind === "display" ? (
    <DisplayScreen token={token} storeName={target.storeName} />
  ) : (
    <WaitingScreen token={token} />
  );
}
