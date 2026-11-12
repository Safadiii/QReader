import type { Metadata } from "next";
import { TrackView } from "@/components/track/TrackView";

export const metadata: Metadata = {
  title: "Order page preview · QReader",
  robots: { index: false, follow: false },
};

/** Shown inside the dashboard's designer; it has no order of its own. */
export default function TrackPreviewPage() {
  return <TrackView token="" preview />;
}
