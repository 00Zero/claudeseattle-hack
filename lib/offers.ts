// Sponsor offers on /resources (credits and promo codes). See
// supabase/migrations/*_shared_offers.sql: attendees read them through attendee_offers(),
// admins switch them on and off, manage the links and see who clicked what in /admin/offers.

export type OfferLink = { id: string; label: string; url: string; code: string | null };

// A row of attendee_offers(). links is empty while the offer is locked (check-in required).
export type AttendeeOffer = {
  slug: string;
  provider: string;
  headline: string;
  about: string;
  details: string[];
  steps: string[];
  requires_checkin: boolean;
  unlocked: boolean;
  links: OfferLink[];
};

export type Offer = {
  slug: string;
  provider: string;
  headline: string;
  sort_order: number;
  enabled: boolean;
  requires_checkin: boolean;
};

export type OfferLinkRow = OfferLink & { offer_slug: string; sort_order: number };

// offer_clicks.kind: a redemption link, or the promo code copied on its own.
export type OfferClickKind = "link" | "code";

export type OfferClick = {
  profile_id: string;
  offer_slug: string;
  link_id: string | null;
  link_label: string | null;
  kind: OfferClickKind;
  clicked_at: string;
};

export const OFFER_FLAGS = ["enabled", "requires_checkin"] as const;
export type OfferFlag = (typeof OFFER_FLAGS)[number];
