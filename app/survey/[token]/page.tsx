import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBusinessOwner, type Answers, type Group, type Role } from "@/lib/followup/survey";
import { SurveyForm } from "../survey-form";

export const metadata: Metadata = { title: "Hackathon feedback", robots: { index: false } };

// /survey/<token>: the post-event survey, opened from the feedback email. No sign-in needed.
// Each visit is counted on the invite, with whoever is signed in at the time.
export default async function SurveyPage({ params }: PageProps<"/survey/[token]">) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: invite } = /^[0-9a-f]{32}$/.test(token)
    ? await admin.from("followup_invites").select("id, email, profile_id, first_name, grp, role, happy_hour, first_visit_at, visits, luma_guests(professional_role)").eq("token", token).maybeSingle()
    : { data: null };

  if (!invite) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="font-display text-4xl font-light">Link not valid</h1>
        <p className="text-fg-muted">This survey link doesn&apos;t work. Use the link in your feedback email, or reply to that email and we&apos;ll help.</p>
      </div>
    );
  }

  const { data: claims } = await (await createClient()).auth.getClaims();
  // The address to sign in with for photo uploads: their account's, if it isn't the one the survey went to.
  const account = invite.profile_id ? (await admin.auth.admin.getUserById(invite.profile_id)).data.user?.email?.toLowerCase() : undefined;
  const signInEmail = account && account !== invite.email ? account : null;
  const now = new Date().toISOString();
  const [, { data: response }] = await Promise.all([
    admin
      .from("followup_invites")
      .update({
        first_visit_at: invite.first_visit_at ?? now,
        last_visit_at: now,
        visits: invite.visits + 1,
        ...(claims?.claims.sub ? { visit_profile_id: claims.claims.sub } : {}),
      })
      .eq("id", invite.id),
    admin.from("followup_responses").select("answers, updated_at").eq("invite_id", invite.id).maybeSingle(),
  ]);

  return (
    <SurveyForm
      token={token}
      firstName={invite.first_name}
      group={invite.grp as Group}
      role={invite.role as Role}
      happyHour={invite.happy_hour}
      owner={isBusinessOwner((invite.luma_guests as unknown as { professional_role: string | null } | null)?.professional_role)}
      signInEmail={signInEmail}
      previous={(response?.answers as Answers | undefined) ?? null}
      answeredAt={response?.updated_at ?? null}
    />
  );
}
