import type { Metadata } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./styles.css";
import "./globals.css";
import { Providers } from "./providers";
import FloatingBackground from "@/components/ui/FloatingBackground";

const pixelifySans = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pixelify-sans",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://rocket-candle.vercel.app/"),
  title: "Rocket Candle",
  description:
    "Launch rockets through candlestick barriers, destroy enemies, and earn RocketFUEL tokens in this physics-based puzzle game",
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
      "Launch rockets through candlestick barriers, destroy enemies, and earn RocketFUEL tokens in this physics-based puzzle game",
    images: ["/logo.png"],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Rocket Candle",
    description:
      "Launch rockets through candlestick barriers, destroy enemies, and earn RocketFUEL tokens in this physics-based puzzle game",
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
        <meta name="msapplication-TileColor" content="#1a1a2e" />
        <meta name="theme-color" content="#1a1a2e" />
      </head>
      <body className={`${pixelifySans.variable}`}>
        <FloatingBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
