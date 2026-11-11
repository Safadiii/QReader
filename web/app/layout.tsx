import type { Metadata } from "next";
import { Anton, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// latin-ext carries the Turkish letters (ş, ğ, ı, İ).
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "QReader",
  description: "Scan the code, get buzzed when your order is ready.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
