import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Sign in · QReader",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    // The form reads ?next= from the URL, which is only known at request time.
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
