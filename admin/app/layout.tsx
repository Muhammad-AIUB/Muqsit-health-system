import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Muqsit Health System Admin — Dashboard",
  description: "Administration dashboard for the Muqsit Health System platform.",
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
      <body>{children}</body>
    </html>
  );
}
