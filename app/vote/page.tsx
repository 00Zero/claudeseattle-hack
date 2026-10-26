import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentAccess } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";
import { Ballot, type BallotData } from "./ballot";

export const metadata: Metadata = { title: "Audience choice" };

// Audience choice (*_shared_audience_vote.sql): checked-in guests rank the finalists first to
// third for 3, 2 and 1 points. A 404 until an admin turns the feature on in /admin/settings. Super admins open and close voting from the awards deck, which
// shows a QR code to this page and reveals the result. audience_ballot() returns the finalists
// only once voting has opened, and only to people who may vote; their own team is marked.
export default async function VotePage() {
  const access = await getCurrentAccess();
  if (!access) redirect("/login");
  if (access === "blocked") redirect("/declined");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("audience_ballot");
  if (error) throw new Error(`Couldn't load the ballot: ${error.message}`);
  const ballot = data as BallotData | { state: "off" };
  if (ballot.state === "off") notFound();

  return <Ballot data={ballot} />;
}
