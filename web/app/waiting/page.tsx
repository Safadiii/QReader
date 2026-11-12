import type { Metadata } from "next";
import { WaitingScreen } from "@/components/waiting/WaitingScreen";

export const metadata: Metadata = {
  title: "Ready orders · QReader",
  robots: { index: false, follow: false },
};

/** For a TV in the shop: lists ready orders and calls them out. */
export default function WaitingPage() {
  return <WaitingScreen />;
}
