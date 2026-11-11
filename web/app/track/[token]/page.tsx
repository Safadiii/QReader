import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackView } from "@/components/track/TrackView";

export const metadata: Metadata = {
  title: "Your order · QReader",
  // The URL is the customer's key to the order: keep it out of search engines.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function Tracker({ params }: { params: PageProps<"/track/[token]">["params"] }) {
  const { token } = await params;
  return <TrackView token={token} />;
}

/** Where the QR sends the customer: live status for their order. */
export default function TrackPage({ params }: PageProps<"/track/[token]">) {
  return (
    <Suspense fallback={null}>
      <Tracker params={params} />
    </Suspense>
  );
}
