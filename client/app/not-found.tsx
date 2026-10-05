import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found — Muqsit Health System" };

// A mistyped or outdated address. Without this file Next shows its own bare
// "404 | This page could not be found." in black on white, which looks like
// the product broke. Plain colours on purpose: this page is rendered on the
// server and must not pull the client theme in.
export default function NotFound() {
  return (
    <main style={{ minHeight: "80vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", color: "#202124" }}>
      <div aria-hidden style={{ width: 48, height: 48, borderRadius: 12, background: "#1A73E8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em" }}>MHS+</div>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>This page does not exist</h1>
      <p style={{ fontSize: 13.5, color: "#565A5F", maxWidth: 380, lineHeight: 1.55 }}>
        The address may be mistyped, or the page may have moved. Nothing in your records is affected.
      </p>
      <Link
        href="/prescription"
        style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 16px", borderRadius: 8, background: "#1A73E8", color: "#fff", fontSize: 13, fontWeight: 500, textDecoration: "none", marginTop: 4 }}
      >
        Go to Prescription
      </Link>
    </main>
  );
}
