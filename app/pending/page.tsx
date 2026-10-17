import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { sundaySchedule } from "@/lib/event";
import { SignOutButton } from "@/app/auth/sign-out-button";

export default async function PendingPage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access === "full") redirect("/");
  if (access === "blocked") redirect("/declined");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Your registration is awaiting approval</h1>
        <p>
          We&apos;ll let you in once the organizers approve your registration. Meanwhile you can{" "}
          <Link href="/profile" className="underline">
            fill in your profile
          </Link>
          .
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sunday, October 25</h2>
        <ul className="space-y-1">
          {sundaySchedule.map((item) => (
            <li key={item.time + item.what}>
              <span className="inline-block w-32 font-medium">{item.time}</span> {item.what}
            </li>
          ))}
        </ul>
      </section>
      <SignOutButton />
    </div>
  );
}
