import { redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/supabase/profile";
import { AddEmailForm, MakeDefaultButton, ProfileForm } from "./forms";

// Scaffolded by Adam; Dev A extends it (see app/(teams)/CLAUDE.md).
export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if ((await getCurrentAccess()) === "blocked") redirect("/declined");

  const supabase = await createClient();
  const { data: emails } = await supabase
    .from("profile_emails")
    .select("email, verified, is_default, source")
    .eq("profile_id", profile.id)
    .order("is_default", { ascending: false })
    .order("email");

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Your profile</h1>
        {!profile.profile_confirmed && (
          <p className="rounded border border-foreground/20 p-3 text-sm">
            We filled this in from your Luma registration. Check it, answer the technical question, and confirm.
          </p>
        )}
        <ProfileForm profile={profile} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Emails</h2>
        <p className="text-sm text-foreground/70">
          Any verified email signs you in to this account. Your default email gets sign-in links and event mail.
        </p>
        <ul className="divide-y divide-foreground/10 rounded border border-foreground/20">
          {(emails ?? []).map((row) => (
            <li key={row.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="break-all">{row.email}</span>
              <span className="flex items-center gap-3 text-sm">
                {row.is_default && <span className="rounded bg-foreground/10 px-2 py-0.5">Default</span>}
                {row.verified ? (
                  <span className="text-green-700">Verified</span>
                ) : (
                  <span className="text-foreground/60">Check your inbox to verify</span>
                )}
                {row.verified && !row.is_default && <MakeDefaultButton email={row.email} />}
              </span>
            </li>
          ))}
        </ul>
        <AddEmailForm />
      </section>
    </div>
  );
}
