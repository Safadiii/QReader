import type { Metadata } from "next";
import { Suspense } from "react";
import { backend } from "@/lib/backend";
import { readPosterToken } from "@/lib/poster";
import { JoinForm } from "@/components/join/JoinForm";

export const metadata: Metadata = {
  title: "Your order · QReader",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Join({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  const storeId = readPosterToken(token);
  let name = "";
  if (storeId) {
    try {
      const res = await backend(`/stores/${storeId}/settings`);
      if (res.ok) name = (await res.json()).name ?? "";
    } catch {
      /* the page still works without the name */
    }
  }
  return <JoinForm token={token} store={name} valid={storeId !== null} />;
}

/** Where the printed poster's QR sends the customer: type the number on your receipt. */
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <Suspense fallback={null}>
      <Join params={params} />
    </Suspense>
  );
}
