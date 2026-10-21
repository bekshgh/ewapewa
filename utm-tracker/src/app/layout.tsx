import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Fonts live in the repository (src/app/fonts, from Google Fonts): the build no longer
// downloads them, so a hiccup at fonts.googleapis.com cannot fail it. These faces have
// Latin only; Onest (and JetBrains Mono's own Cyrillic) draw Russian / Kazakh text — so the
// Latin faces get no metric-matched Arial fallback, which would grab the Cyrillic first.
const display = localFont({ src: "./fonts/bricolage-latin.woff2", weight: "600 800", variable: "--font-display", display: "swap", adjustFontFallback: false });
const sans = localFont({ src: "./fonts/hanken-latin.woff2", weight: "100 900", variable: "--font-sans", display: "swap", adjustFontFallback: false });
const cyrillic = localFont({ src: "./fonts/onest-cyrillic.woff2", weight: "100 900", variable: "--font-cyrillic", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-latin.woff2", weight: "100 800", variable: "--font-mono", display: "swap", adjustFontFallback: false });
const monoCyrillic = localFont({ src: "./fonts/jetbrains-cyrillic.woff2", weight: "100 800", variable: "--font-mono-cyrillic", display: "swap" });

export const metadata: Metadata = {
  title: "EwA Tracker — UTM & conversion analytics",
  description: "Create UTM links, count clicks server-side, and attribute leads.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${cyrillic.variable} ${mono.variable} ${monoCyrillic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
