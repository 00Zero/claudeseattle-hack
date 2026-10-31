import { requireAdminPage } from "@/lib/admin";
import { TeamsDirectory } from "./directory";
import { loadDirectory } from "./load";

// One place for teams and people: every team with its roster, who has no team, and a search
// across all of them (docs/REQUIREMENTS.md, "Admin → Teams").
export default async function AdminTeamsPage({ searchParams }: PageProps<"/admin/teams">) {
  await requireAdminPage();
  const { q } = await searchParams;
  const { teams, people } = await loadDirectory();
  return <TeamsDirectory teams={teams} people={people} initialQuery={typeof q === "string" ? q : ""} />;
}
