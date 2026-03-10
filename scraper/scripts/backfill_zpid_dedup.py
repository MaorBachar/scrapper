"""
Backfill script: merge duplicate property_key_hashes that share a zpid.

For each zpid with multiple hashes, pick the oldest hash as canonical,
then reassign all listings and lifecycle entries to the canonical hash,
and delete the non-canonical property rows.

Also: set llc_id = NULL on all auto lifecycle entries (property-level events).

Run AFTER supabase-zpid-dedup.sql migration.
"""
import sys
sys.path.insert(0, "src")

from zillow_scrapper.supabase_client import get_supabase_client


def fetch_all(client, table, select, filters=None):
    rows = []
    offset = 0
    while True:
        q = client.table(table).select(select)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        batch = q.range(offset, offset + 999).execute().data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    return rows


def main():
    client = get_supabase_client()
    if not client:
        print("No Supabase client")
        sys.exit(1)

    # 1. Build zpid -> list of hashes from listings
    print("Fetching all listings (zpid, property_key_hash)...")
    listings = fetch_all(client, "listings", "zpid, property_key_hash")
    zpid_to_hashes = {}
    for r in listings:
        z = r.get("zpid")
        h = r.get("property_key_hash")
        if z and h:
            zpid_to_hashes.setdefault(z, set()).add(h)

    multi = {z: list(hs) for z, hs in zpid_to_hashes.items() if len(hs) > 1}
    print(f"ZPIDs with multiple hashes: {len(multi)}")
    if not multi:
        print("No duplicates to merge.")
    else:
        total_merged = 0
        for zpid, hashes in multi.items():
            canonical = sorted(hashes)[0]
            non_canonical = [h for h in hashes if h != canonical]

            for old_hash in non_canonical:
                # Reassign listings
                try:
                    client.table("listings").update(
                        {"property_key_hash": canonical}
                    ).eq("property_key_hash", old_hash).execute()
                except Exception as e:
                    print(f"  Error reassigning listings {old_hash[:12]}->{ canonical[:12]}: {e}")

                # Reassign lifecycle entries
                try:
                    client.table("lifecycle").update(
                        {"property_key_hash": canonical}
                    ).eq("property_key_hash", old_hash).execute()
                except Exception as e:
                    print(f"  Error reassigning lifecycle {old_hash[:12]}->{canonical[:12]}: {e}")

                # Delete non-canonical property row
                try:
                    client.table("properties").delete().eq(
                        "property_key_hash", old_hash
                    ).execute()
                except Exception as e:
                    print(f"  Error deleting property {old_hash[:12]}: {e}")

                total_merged += 1

        print(f"Merged {total_merged} duplicate property hashes into canonical ones.")

    # 2. Update zpid on canonical properties (some may be missing after merge)
    print("Updating zpid on properties table...")
    props_without_zpid = fetch_all(client, "properties", "property_key_hash")
    updated = 0
    for p in props_without_zpid:
        pkh = p.get("property_key_hash")
        # Get zpid from a listing with this hash
        sample = client.table("listings").select("zpid").eq(
            "property_key_hash", pkh
        ).not_.is_("zpid", "null").limit(1).execute().data
        if sample and sample[0].get("zpid"):
            client.table("properties").update(
                {"zpid": sample[0]["zpid"]}
            ).eq("property_key_hash", pkh).execute()
            updated += 1
    print(f"Updated zpid on {updated} properties.")

    # 3. Set llc_id = NULL on all auto lifecycle entries
    print("Setting llc_id = NULL on auto lifecycle entries...")
    auto_entries = fetch_all(client, "lifecycle", "id, llc_id", {"source": "auto"})
    nullified = 0
    for e in auto_entries:
        if e.get("llc_id") is not None:
            client.table("lifecycle").update(
                {"llc_id": None}
            ).eq("id", e["id"]).execute()
            nullified += 1
    print(f"Nullified llc_id on {nullified} auto lifecycle entries.")

    # 4. Deduplicate auto lifecycle entries (same property_key_hash + lifecycle + description)
    print("Deduplicating auto lifecycle entries...")
    auto_all = fetch_all(client, "lifecycle", "id, property_key_hash, lifecycle, description", {"source": "auto"})
    seen = {}
    to_delete = []
    for e in auto_all:
        key = (e.get("property_key_hash"), e.get("lifecycle"), e.get("description"))
        if key in seen:
            to_delete.append(e["id"])
        else:
            seen[key] = e["id"]

    for rid in to_delete:
        client.table("lifecycle").delete().eq("id", rid).execute()
    print(f"Deleted {len(to_delete)} duplicate auto lifecycle entries.")

    # 5. Now deduplicate listings (same zpid + llc_id, keep newest)
    print("Deduplicating listings by zpid + llc_id...")
    all_listings = fetch_all(client, "listings", "id, zpid, llc_id, created_at")
    by_key = {}
    for l in all_listings:
        z = l.get("zpid")
        llc = l.get("llc_id")
        if not z:
            continue
        key = (z, llc)
        if key not in by_key:
            by_key[key] = []
        by_key[key].append(l)

    listings_deleted = 0
    for key, group in by_key.items():
        if len(group) <= 1:
            continue
        group.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        keep = group[0]
        for dup in group[1:]:
            try:
                client.table("listings").delete().eq("id", dup["id"]).execute()
                listings_deleted += 1
            except Exception as e:
                print(f"  Error deleting listing {dup['id']}: {e}")

    print(f"Deleted {listings_deleted} duplicate listings.")

    # Summary
    final_props = client.table("properties").select("property_key_hash", count="exact").execute()
    final_listings = client.table("listings").select("id", count="exact").execute()
    final_lc = client.table("lifecycle").select("id", count="exact").execute()
    print(f"\nFinal counts: properties={final_props.count}, listings={final_listings.count}, lifecycle={final_lc.count}")


if __name__ == "__main__":
    main()
