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
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
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
