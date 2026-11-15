"use client";

import { useEffect, useState } from "react";
import type { Role } from "@/lib/roles";

export type Me = { id: string; role: Role; name: string; phone: string; store: string };

/** The signed-in member (null while loading or when signed out). */
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    let stopped = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((next) => !stopped && setMe(next))
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, []);
  return me;
}
