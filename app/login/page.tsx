import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { LoginForm } from "./login-form";

const errorMessages: Record<string, string> = {
  link:
    "That sign-in link no longer works. Each link works once, and asking for a new link cancels the earlier ones. " +
    "If you asked more than once, open the newest email from Claude Seattle (check spam too) instead of requesting " +
    "another. Otherwise, enter your email below for a new link.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentProfile()) redirect("/");
  const { error } = await searchParams;
  const message = typeof error === "string" ? errorMessages[error] : undefined;

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Log in</h1>
      {message && <p className="text-sm text-red-600">{message}</p>}
      <LoginForm />
    </div>
  );
}
