import type { Metadata } from "next";
import { Geist_Mono, Instrument_Sans, Press_Start_2P } from "next/font/google";
import "./styles.css";
import "./globals.css";
// Last, so the new language wins over the stylesheets it is replacing.
import "./design-system.css";
import { Providers } from "./providers";
import FloatingBackground from "@/components/ui/FloatingBackground";

/**
 * Three faces, each with one job.
 *
 * Self-hosted through the framework rather than fetched from a font CDN: it
 * removes a third-party round trip from first paint, and the pixel face in
 * particular has to be present before the first frame or every title reflows
 * once it arrives.
 */

/** Titles, labels, buttons, score. A display face - never body copy. */
const pressStart = Press_Start_2P({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-press-start",
  display: "swap",
  preload: true,
});

/** Prose. */
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
  display: "swap",
  preload: true,
});

/** Data: amounts, addresses, timestamps - anything read down a column. */
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rocket-candle.vercel.app/"),
  title: "Rocket Candle",
  description:
    "Launch rockets through candlestick barriers, destroy enemies, and earn WICK tokens in this physics-based puzzle game",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
    other: [
      {
        rel: "android-chrome",
        url: "/android-chrome-192x192.png",
        sizes: "192x192",
      },
      {
        rel: "android-chrome",
        url: "/android-chrome-512x512.png",
        sizes: "512x512",
      },
    ],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Rocket Candle",
    description:
      "Launch rockets through candlestick barriers, destroy enemies, and earn WICK tokens in this physics-based puzzle game",
    images: ["/logo.png"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Rocket Candle",
    description:
      "Launch rockets through candlestick barriers, destroy enemies, and earn WICK tokens in this physics-based puzzle game",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no, orientation=landscape"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Rocket Candle" />
        <meta name="application-name" content="Rocket Candle" />
        <meta name="msapplication-TileColor" content="#14161a" />
        <meta name="theme-color" content="#2a2d34" />
      </head>
      <body
        className={`${pressStart.variable} ${instrumentSans.variable} ${geistMono.variable}`}
      >
        <FloatingBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
