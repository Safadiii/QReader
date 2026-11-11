import type { Metadata } from "next";
import { DisplayScreen } from "@/components/display/DisplayScreen";

export const metadata: Metadata = {
  title: "Scan your order · QReader",
};

/** The screen that faces the customer at the till. */
export default function DisplayPage() {
  return <DisplayScreen />;
}
