import type { Metadata } from "next";
import { Anton, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

// latin-ext carries the Turkish letters (ş, ğ, ı, İ).
const body = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
});

const display = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin", "latin-ext"],
});

const mono = Space_Mono({
  variable: "--font-mono",
  weight: ["400", "700"],
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
      className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
