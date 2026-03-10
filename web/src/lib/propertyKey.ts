type ListingInput = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  days_on_zillow?: number | null;
  created_at?: string | null;
};

export function getPropertyKey(listing: ListingInput): string {
  const addr = [listing.address, listing.city, listing.state, listing.zipcode]
    .filter(Boolean)
    .join(", ")
    .trim() || "unknown";
  const listDate = getListDate(listing);
  return `${addr}|${listDate}`;
}

export function getListDate(listing: ListingInput): string {
  if (listing.days_on_zillow == null || !listing.created_at) return "unknown";
  try {
    const scraped = new Date(listing.created_at);
    if (isNaN(scraped.getTime())) return "unknown";
    const listed = new Date(
      scraped.getTime() - listing.days_on_zillow * 86400000
    );
    const y = listed.getUTCFullYear();
    const m = String(listed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(listed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  } catch {
    return "unknown";
  }
}
