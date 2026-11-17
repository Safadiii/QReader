import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { backend } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import "./menu.css";
import { MenuBrowser } from "@/components/mobile/MenuBrowser";

export const metadata: Metadata = {
  title: "Menu",
  robots: { index: false, follow: false },
};

async function MenuPage({
  params,
  searchParams,
}: {
  params: PageProps<"/menu/[token]">["params"];
  searchParams: PageProps<"/menu/[token]">["searchParams"];
}) {
  await connection(); // always rendered at request time: the menu changes whenever the café edits it
  const { token } = await params;
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const table = (one(query.table) ?? "").replace(/[^0-9A-Za-z \-]/g, "").slice(0, 20);
  const wantsCollect = one(query.mode) === "collect";
  const storeId = readPosterToken(token);
  let menu: (Parameters<typeof MenuBrowser>[0]["menu"] & { enabled: boolean }) | null = null;
  if (storeId) {
    try {
      const res = await backend(`/stores/${storeId}/menu/public`);
      if (res.ok) menu = await res.json();
    } catch {
      /* shows the "not available" message */
    }
  }

  if (!menu || !menu.enabled || menu.items.length === 0) {
    return (
      <main className="pm">
        <div className="pm-empty">
          <h1>{menu?.store_name ?? "Menu"}</h1>
          <p>Menü şu an kullanılamıyor · The menu isn&apos;t available right now.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="pm">
      <MenuBrowser token={token} menu={menu} table={table} wantsCollect={wantsCollect} />
    </main>
  );
}

/** The café's digital menu, opened from the link on the Extras page. */
export default function Page({ params, searchParams }: PageProps<"/menu/[token]">) {
  return (
    <Suspense fallback={null}>
      <MenuPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}
