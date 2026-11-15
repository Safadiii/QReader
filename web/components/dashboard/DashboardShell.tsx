"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./dashboard.css";
import { reloadTo } from "@/lib/navigate";
import { useLang } from "@/lib/i18n";
import { ROLE_LABEL, atLeast, type Role } from "@/lib/roles";
import { useMe } from "@/lib/use-me";

const NAV: { href: string; tr: string; en: string; min: Role }[] = [
  { href: "/dashboard", tr: "Siparişler", en: "Orders", min: "staff" },
  { href: "/dashboard/analytics", tr: "Analiz", en: "Analytics", min: "manager" },
  { href: "/dashboard/page", tr: "Sipariş sayfası", en: "Order page", min: "manager" },
  { href: "/dashboard/team", tr: "Ekip", en: "Team", min: "manager" },
  { href: "/dashboard/screens", tr: "Ekranlar (iPad, TV)", en: "Screens (iPad, TV)", min: "manager" },
  { href: "/dashboard/settings", tr: "Ayarlar", en: "Settings", min: "manager" },
];

/** Full-screen views meant for their own device; they open in a new tab. The iPad and TV
 * screens are opened from their links on the Screens page, not from here. */
const SCREENS = [{ href: "/kitchen", tr: "Mutfak ekranı", en: "Kitchen screen" }];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLang();
  const me = useMe();
  // Until we know who is signed in, show only what everyone may see.
  const role = me?.role ?? "staff";
  return (
    <div className="ds-shell">
      <aside className="ds-side">
        <Link href="/dashboard" className="ds-brand">
          QReader
        </Link>

        <nav className="ds-nav" aria-label="Dashboard">
          {NAV.filter((item) => atLeast(role, item.min)).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="ds-link"
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {t(item.tr, item.en)}
            </Link>
          ))}
        </nav>

        <div className="ds-group">{t("Ekranlar", "Screens")}</div>
        <nav className="ds-nav" aria-label={t("Ekranlar", "Screens")}>
          {SCREENS.map((item) => (
            <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="ds-link">
              {t(item.tr, item.en)}
              <span>↗</span>
            </a>
          ))}
        </nav>

        {me && (
          <div className="ds-who">
            <b>{me.name}</b>
            <span>
              {t(ROLE_LABEL[me.role].tr, ROLE_LABEL[me.role].en)}
              {me.store ? ` · ${me.store}` : ""}
            </span>
          </div>
        )}

        <button
          className="ds-logout"
          onClick={() =>
            void fetch("/api/auth/logout", { method: "POST" }).then(() => reloadTo("/login"))
          }
        >
          {t("Çıkış yap", "Sign out")}
        </button>
      </aside>

      <div className="ds-main">{children}</div>
    </div>
  );
}