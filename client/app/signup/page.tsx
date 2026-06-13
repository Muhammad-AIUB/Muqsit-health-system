import { Suspense } from "react";
import type { Metadata } from "next";
import SignupPage from "@/components/layout/SignupPage";
import { RedirectIfAuthed } from "@/components/auth/guards";

export const metadata: Metadata = { title: "Create account — Muqsit Health System" };

export default function Signup() {
  return (
    <Suspense>
      <RedirectIfAuthed>
        <SignupPage />
      </RedirectIfAuthed>
    </Suspense>
  );
}
