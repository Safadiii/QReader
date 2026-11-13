"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./dashboard.css";
import { reloadTo } from "@/lib/navigate";
import { useLang } from "@/lib/i18n";

const NAV = [
  { href: "/dashboard", tr: "Siparişler", en: "Orders" },
  { href: "/dashboard/analytics", tr: "Analiz", en: "Analytics" },
  { href: "/dashboard/page", tr: "Sipariş sayfası", en: "Order page" },
  { href: "/dashboard/settings", tr: "Ayarlar", en: "Settings" },
];

/** Full-screen views meant for their own device; they open in a new tab. */
const SCREENS = [
  { href: "/kitchen", tr: "Mutfak ekranı", en: "Kitchen screen" },
  { href: "/display", tr: "Müşteri ekranı (QR)", en: "Customer screen (QR)" },
  { href: "/waiting", tr: "Bekleme ekranı (TV)", en: "Waiting screen (TV)" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useLang();
  return (
    <div className="ds-shell">
      <aside className="ds-side">
        <Link href="/dashboard" className="ds-brand">
          QReader
        </Link>

        <nav className="ds-nav" aria-label="Dashboard">
          {NAV.map((item) => (
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