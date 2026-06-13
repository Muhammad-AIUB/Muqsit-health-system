import { Suspense } from "react";
import type { Metadata } from "next";
import LoginPage from "@/components/layout/LoginPage";
import { RedirectIfAuthed } from "@/components/auth/guards";

export const metadata: Metadata = { title: "Sign in — Muqsit Health System" };

export default function Login() {
  return (
    <Suspense>
      <RedirectIfAuthed>
        <LoginPage />
      </RedirectIfAuthed>
    </Suspense>
  );
}
