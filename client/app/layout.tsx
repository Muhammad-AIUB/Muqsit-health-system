import type { Metadata } from "next";
import Providers from "@/components/providers/Providers";
import { paletteCss } from "@/theme/palette";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
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
    // suppressHydrationWarning: the boot script may set data-theme before React
    // hydrates, an attribute the server did not render.
    <html lang="en" suppressHydrationWarning>
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
        {/* Night mode is put on before anything is drawn, so a reload at night
            never flashes white (src/lib/theme.ts). First-party, inline. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Every colour of the app, light and night (src/theme/palette.ts). */}
        <style id="mhs-palette" dangerouslySetInnerHTML={{ __html: paletteCss() }} />
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
