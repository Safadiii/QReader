import type { Metadata } from "next";
import { Suspense } from "react";
import { ScreenByToken } from "@/components/screen/ScreenByToken";

export const metadata: Metadata = {
  title: "Screen · QReader",
  // The link is the key to the screen: keep it out of search engines and referrers.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Screen({ params }: { params: PageProps<"/screen/[token]">["params"] }) {
  const { token } = await params;
  return <ScreenByToken token={token} />;
}

/** The iPad (customer QR) and TV (ready orders) open this; no sign-in on the device. */
export default function ScreenPage({ params }: PageProps<"/screen/[token]">) {
  return (
    <Suspense fallback={null}>
      <Screen params={params} />
    </Suspense>
  );
}
