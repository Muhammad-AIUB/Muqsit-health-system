import type { Metadata } from "next";
import Providers from "@/components/providers/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muqsit Health System — Patient Management & Prescription System",
  description: "Offline-ready clinical prescription and patient management system.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* The font is served by this app (globals.css @font-face); nothing is
            fetched from Google. Preloading the Latin file avoids a flash of the
            fallback font on first paint. */}
        <link
          rel="preload"
          href="/fonts/dm-sans-5.3.0/dm-sans-latin-wght-normal.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      {/* suppressHydrationWarning silences a noisy dev-only warning caused
          by browser extensions (Grammarly, ColorZilla, etc.) that inject
          attributes onto <body> after the server-rendered HTML loads. It
          only affects this one element; React still hydrates as normal. */}
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
