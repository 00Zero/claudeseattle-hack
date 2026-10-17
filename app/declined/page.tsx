import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { SignOutButton } from "@/app/auth/sign-out-button";

export default async function DeclinedPage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access !== "blocked") redirect("/");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Your registration wasn&apos;t approved</h1>
      <p>Sorry, we couldn&apos;t fit you in for this event. Watch for future Claude Seattle events.</p>
      <SignOutButton />
    </div>
  );
}
