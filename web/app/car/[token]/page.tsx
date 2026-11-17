import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { backend } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import { CarForm } from "@/components/mobile/CarForm";

export const metadata: Metadata = {
  title: "Car order",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function CarPage({ params }: { params: PageProps<"/car/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const storeId = readPosterToken(token);
  let page: { store_name: string; available: boolean; menu_url_enabled: boolean } | null = null;
  if (storeId) {
    try {
      const res = await backend(`/stores/${storeId}/car/public`);
      if (res.ok) page = await res.json();
    } catch {
      /* falls through to the "not valid" message */
    }
  }
  if (!page) {
    return (
      <main style={{ padding: 32, textAlign: "center" }}>
        Bu bağlantı geçersiz · This link isn&apos;t valid.
      </main>
    );
  }
  return (
    <main className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <CarForm
        token={token}
        store={page.store_name}
        available={page.available}
        menuHref={page.menu_url_enabled ? `/menu/${token}` : null}
      />
    </main>
  );
}

/** The link a café gives to customers in cars: tell us what you want and where your car is. */
export default function Page({ params }: PageProps<"/car/[token]">) {
  return (
    <Suspense fallback={null}>
      <CarPage params={params} />
    </Suspense>
  );
}
