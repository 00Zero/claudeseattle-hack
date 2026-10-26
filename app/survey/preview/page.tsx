import type { Metadata } from "next";
import { requireAdminPage } from "@/lib/admin";
import { GROUPS, ROLES, type Group, type Role } from "@/lib/followup/survey";
import { SurveyForm } from "../survey-form";

export const metadata: Metadata = { title: "Survey preview", robots: { index: false } };

// /survey/preview?group=attended&role=participant: what a group sees, for admins. Nothing is saved.
export default async function SurveyPreviewPage({ searchParams }: PageProps<"/survey/preview">) {
  await requireAdminPage();
  const { group, role } = await searchParams;
  const g = (GROUPS as readonly string[]).includes(String(group)) ? (group as Group) : "attended";
  const r = (ROLES as readonly string[]).includes(String(role)) ? (role as Role) : "participant";
  return <SurveyForm token={null} firstName="Alex" group={g} role={r} previous={null} answeredAt={null} />;
}
