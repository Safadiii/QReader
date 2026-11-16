"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import "./dashboard.css";
import { reloadTo } from "@/lib/navigate";
import { useLang } from "@/lib/i18n";
import { ROLE_LABEL, atLeast, type Role } from "@/lib/roles";
import { useMe } from "@/lib/use-me";
import type { Order } from "@/components/kitchen/types";

/* Tabler-style outline icons, one path each. */
const ICON: Record<string, string> = {
  "/dashboard": "M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-3-2-2 2-2-2-2 2-2-2zM9 7h6M9 11h6M9 15h4",
  "/dashboard/analytics": "M3 13h4v7H3zM10 4h4v16h-4zM17 9h4v11h-4z",
  "/dashboard/screens": "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 17v.01",
  "/dashboard/team": "M9 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2M16 3.1a4 4 0 0 1 0 7.8M21 21v-2a4 4 0 0 0-3-3.9",
  "/dashboard/page": "M12 21a9 9 0 0 1 0-18c5 0 9 3.6 9 8 0 3-2.5 4-5 4h-2a2 2 0 0 0-1 3.7c.6.6.2 2.3-1 2.3zM7.5 11v.01M10.5 7.5v.01M15 8v.01",
  "/dashboard/settings": "M10.3 4.3a1.7 1.7 0 0 1 3.4 0 1.7 1.7 0 0 0 2.6 1.1 1.7 1.7 0 0 1 2.4 2.4 1.7 1.7 0 0 0 1.1 2.6 1.7 1.7 0 0 1 0 3.4 1.7 1.7 0 0 0-1.1 2.6 1.7 1.7 0 0 1-2.4 2.4 1.7 1.7 0 0 0-2.6 1.1 1.7 1.7 0 0 1-3.4 0 1.7 1.7 0 0 0-2.6-1.1 1.7 1.7 0 0 1-2.4-2.4 1.7 1.7 0 0 0-1.1-2.6 1.7 1.7 0 0 1 0-3.4 1.7 1.7 0 0 0 1.1-2.6 1.7 1.7 0 0 1 2.4-2.4 1.7 1.7 0 0 0 2.6-1.1zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
};

function Icon({ d }: { d: string }) {
  return (
    <svg className="ds-ico" viewBox="0 0 24 24" aria-hidden>
      <path d={d} />
    </svg>
  );
}

type Shift = { waiting: number; ready: number; today: number };

/** Live counts for the sidebar's shift card; refreshed while the tab is visible. */
function useShift() {
  const [shift, setShift] = useState<Shift | null>(null);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/kitchen/orders", { cache: "no-store" });
        if (!res.ok) return;
        const { orders } = (await res.json()) as { orders: Order[] };
        const today = new Date().toLocaleDateString("en-CA");
        const todays = orders.filter((o) => o.order_date === today);
        if (stopped) return;
        setShift({
          waiting: orders.filter((o) => o.status === "pending" || o.status === "preparing").length,
          ready: orders.filter((o) => o.status === "ready").length,
          today: todays.length,
        });
      } catch {}
    };
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);
  return shift;
}

// Daily work first, then setup (the rail puts a divider between them).
const NAV: { href: string; tr: string; en: string; min: Role; group: 1 | 2 }[] = [
  { href: "/dashboard", tr: "Siparişler", en: "Orders", min: "staff", group: 1 },
  { href: "/dashboard/screens", tr: "Ekranlar", en: "Screens", min: "manager", group: 1 },
  { href: "/dashboard/analytics", tr: "Analiz", en: "Analytics", min: "manager", group: 2 },
  { href: "/dashboard/team", tr: "Ekip", en: "Team", min: "manager", group: 2 },
  { href: "/dashboard/page", tr: "Sipariş sayfası", en: "Order page", min: "manager", group: 2 },
  { href: "/dashboard/settings", tr: "Ayarlar", en: "Settings", min: "manager", group: 2 },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLang();
  const me = useMe();
  const shift = useShift();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Until we know who is signed in, show only what everyone may see.
  const role = me?.role ?? "staff";
  const items = NAV.filter((item) => atLeast(role, item.min));
  const first = items.filter((i) => i.group === 1);
  const second = items.filter((i) => i.group === 2);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const link = (item: (typeof NAV)[number]) => {
    const label = t(item.tr, item.en);
    const waiting = item.href === "/dashboard" ? (shift?.waiting ?? 0) : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className="ds-link"
        data-label={label}
        aria-label={label}
        aria-current={item.href === pathname ? "page" : undefined}
      >
        <Icon d={ICON[item.href]} />
        {waiting > 0 && (
          <b className="ds-badge" aria-label={t(`${waiting} bekleyen`, `${waiting} waiting`)}>
            {waiting}
          </b>
        )}
      </Link>
    );
  };

  return (
    <div className="ds-shell">
      <aside className="ds-side">
        <Link href="/dashboard" className="ds-logo" aria-label="QReader">
          Q
        </Link>

        <nav className="ds-nav" aria-label="Dashboard">
          {first.map(link)}
          {first.length > 0 && second.length > 0 && <hr className="ds-divider" />}
          {second.map(link)}
        </nav>

        {me && (
          <div className="ds-me" ref={menuRef}>
            <button
              className="ds-avatar"
              aria-haspopup="menu"
              aria-expanded={menu}
              aria-label={t("Hesap menüsü", "Account menu")}
              onClick={() => setMenu((v) => !v)}
            >
              {initials(me.name)}
            </button>
            {menu && (
              <div className="ds-menu" role="menu">
                <b>{me.name}</b>
                <span>
                  {t(ROLE_LABEL[me.role].tr, ROLE_LABEL[me.role].en)}
                  {me.store ? ` · ${me.store}` : ""}
                </span>
                <button
                  role="menuitem"
                  onClick={() =>
                    void fetch("/api/auth/logout", { method: "POST" }).then(() => reloadTo("/login"))
                  }
                >
                  {t("Çıkış yap", "Sign out")}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="ds-main">{children}</div>
    </div>
  );
}
