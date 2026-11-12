"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./dashboard.css";
import { reloadTo } from "@/lib/navigate";

const NAV = [
  { href: "/dashboard", label: "Siparişler", alt: "Orders" },
  { href: "/dashboard/analytics", label: "Analiz", alt: "Analytics" },
  { href: "/dashboard/page", label: "Sipariş sayfası", alt: "Order page" },
  { href: "/dashboard/settings", label: "Ayarlar", alt: "Settings" },
];

/** Full-screen views meant for their own device; they open in a new tab. */
const SCREENS = [
  { href: "/kitchen", label: "Mutfak ekranı", alt: "Kitchen screen" },
  { href: "/display", label: "Müşteri ekranı", alt: "Customer screen (QR)" },
  { href: "/waiting", label: "Bekleme ekranı", alt: "Waiting screen (TV)" },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
              {item.label}
              <span>{item.alt}</span>
            </Link>
          ))}
        </nav>

        <div className="ds-group">Ekranlar · Screens</div>
        <nav className="ds-nav" aria-label="Screens">
          {SCREENS.map((item) => (
            <a key={item.href} href={item.href} target="_blank" rel="noreferrer" className="ds-link">
              {item.label}
              <span>{item.alt} ↗</span>
            </a>
          ))}
        </nav>

        <button
          className="ds-logout"
          onClick={() =>
            void fetch("/api/auth/logout", { method: "POST" }).then(() => reloadTo("/login"))
          }
        >
          Çıkış yap · Sign out
        </button>
      </aside>

      <div className="ds-main">{children}</div>
    </div>
  );
}
