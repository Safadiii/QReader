import type { Metadata } from "next";
import { KitchenScreen } from "@/components/kitchen/KitchenScreen";

export const metadata: Metadata = {
  title: "Kitchen · QReader",
  robots: { index: false, follow: false },
};

/** The staff screen: ring up orders and move them along. */
export default function KitchenPage() {
  return <KitchenScreen />;
}
