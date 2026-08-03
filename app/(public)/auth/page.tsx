import { redirect } from "next/navigation";

/**
 * Legacy email/password auth UI removed.
 * Always send visitors to the canonical LoginForm at /login.
 * Relative redirect keeps the current host (no main↔admin loop).
 */
export default function AuthPage() {
  redirect("/login");
}
