"use server";

import type { OfferClickKind } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

// Records a click on an offer for the stats on /admin/offers. log_offer_click() checks that the
// caller is signed in with full access and that the offer is unlocked for them, and ignores it
// otherwise. A failure here must never get in the way of redeeming, so it is swallowed.
export async function logOfferClick(slug: string, linkId: string | null, kind: OfferClickKind) {
  const supabase = await createClient();
  await supabase.rpc("log_offer_click", { p_slug: slug, p_link: linkId, p_kind: kind });
}
