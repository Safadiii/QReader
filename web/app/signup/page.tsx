import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login/LoginForm";

export const metadata: Metadata = {
  title: "Sign up · QReader",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm initial="signup" />
    </Suspense>
  );
}
