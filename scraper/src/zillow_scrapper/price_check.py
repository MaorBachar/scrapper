"""
Cron-driven price & status change detector.

Queries active listings from Supabase, re-scrapes each unique zipcode via
HomeHarvest, and writes lifecycle entries for any detected changes.
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client


STATUS_MAP = {
    "FOR_SALE": "FOR_SALE",
    "PENDING": "PENDING",
    "CONTINGENT": "CONTINGENT",
    "SOLD": "SOLD",
}

LIFECYCLE_FROM_STATUS = {
    "PENDING": "Pending",
    "CONTINGENT": "Contingent",
    "SOLD": "Sold",
}


def _fmt_price(p: Optional[int]) -> str:
    if p is None:
        return "N/A"
    return f"${p:,}"


def _pct_change(old: int, new: int) -> str:
    if old == 0:
        return ""
    pct = ((new - old) / old) * 100
    sign = "+" if pct > 0 else ""
    return f" ({sign}{pct:.1f}%)"


def _safe_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    try:
        f = float(v)
        if math.isnan(f) or math.isinf(f):
            return None
        return int(f)
    except (ValueError, TypeError):
        return None


def _normalize_address(addr: Optional[str]) -> str:
    if not addr:
        return ""
    return re.sub(r"\s+", " ", addr.strip().lower())


def _fetch_all_rows(client: Client, table: str, select: str, filters: dict[str, Any] | None = None, or_filter: str | None = None) -> list[dict]:
    """Paginate through Supabase to fetch all rows (bypasses 1000-row limit)."""
    all_rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        q = client.table(table).select(select)
        if filters:
            for k, v in filters.items():
                q = q.eq(k, v)
        if or_filter:
            q = q.or_(or_filter)
        q = q.range(offset, offset + page_size - 1)
        result = q.execute()
        data = result.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return all_rows


def check_price_and_status_changes(client: Client) -> tuple[dict[str, int], set[str], dict[str, list[dict]]]:
    """
    Phase 1 of the cron job: price & status change detection.

    1. Load active listings from Supabase
    2. Re-scrape each unique zipcode via HomeHarvest
    3. Match & compare, write lifecycle entries for changes
    4. Return (summary_counts, set_of_scraped_zipcodes, scraped_listing_data_per_zip)
    """
    from zillow_scrapper.scrape_for_sale import scrape_for_sale_zip

    stats = {
        "checked": 0,
        "price_drops": 0,
        "price_increases": 0,
        "status_changes": 0,
        "unknown": 0,
        "back_on_market": 0,
        "errors": 0,
    }

    # 1. Fetch active listings (FOR_SALE only)
    active = _fetch_all_rows(
        client,
        "listings",
        "id, zpid, address, city, state, zipcode, price, listing_status, property_key_hash, llc_id",
        filters={"listing_status": "FOR_SALE"},
    )

    if not active:
        print("[price_check] No active listings found.")
        return stats, set(), {}

    # Deduplicate active listings by zpid (one entry per physical property)
    by_zpid: dict[str, dict] = {}
    for row in active:
        zpid = row.get("zpid")
        if zpid and zpid not in by_zpid:
            by_zpid[zpid] = row

    unique_props = list(by_zpid.values())
    stats["checked"] = len(unique_props)
    print(f"[price_check] Found {len(active)} active listings, {len(unique_props)} unique properties.")

    # Group by zipcode for efficient scraping
    by_zip: dict[str, list[dict]] = {}
    for row in unique_props:
        z = row.get("zipcode")
        if z:
            by_zip.setdefault(z, []).append(row)

    print(f"[price_check] Unique zipcodes to scrape: {len(by_zip)}")

    # Build lookup maps for matching scraped results to DB listings
    zpid_map: dict[str, dict] = {}
    addr_map: dict[str, dict] = {}
    for row in unique_props:
        zpid = row.get("zpid")
        if zpid:
            zpid_map[zpid] = row
        norm = _normalize_address(
            ", ".join(x for x in (row.get("address"), row.get("city"), row.get("state"), row.get("zipcode")) if x)
        )
        if norm:
            addr_map[norm] = row

    found_zpids: set[str] = set()
    processed_zpids: set[str] = set()
    scraped_data: dict[str, list[dict]] = {}

    # 2. Scrape each zipcode
    for zipcode, db_rows in by_zip.items():
        print(f"[price_check] Scraping zipcode {zipcode} ({len(db_rows)} listings)...")
        try:
            result = scrape_for_sale_zip(zip_code=zipcode)
            scraped_data[zipcode] = result.get("listings", [])

            from homeharvest import scrape_property
            import pandas as pd

            df = scrape_property(
                location=zipcode,
                listing_type="for_sale",
            )

            if df is None or len(df) == 0:
                print(f"[price_check] No results for zipcode {zipcode}, marking as unknown.")
                for row in db_rows:
                    zpid = row.get("zpid")
                    pkh = row.get("property_key_hash")
                    if zpid and zpid not in processed_zpids and pkh:
                        processed_zpids.add(zpid)
                        _handle_disappeared(client, pkh, stats)
                continue

            scraped_props = df.to_dict(orient="records")

            # Build scraped lookup by zpid and address
            scraped_by_zpid: dict[str, dict] = {}
            scraped_by_addr: dict[str, dict] = {}
            for prop in scraped_props:
                mls_id = str(prop.get("mls_id") or "") or None
                if mls_id:
                    scraped_by_zpid[mls_id] = prop
                addr = _normalize_address(prop.get("formatted_address") or prop.get("full_street_line") or "")
                city = (prop.get("city") or "").strip()
                state = (prop.get("state") or "").strip()
                zc = str(prop.get("zip_code") or "").strip()
                full_addr = _normalize_address(", ".join(x for x in (addr.split(",")[0].strip() if addr else "", city, state, zc) if x))
                if full_addr:
                    scraped_by_addr[full_addr] = prop

            # 3. Match and compare each DB property (deduplicated by zpid)
            for row in db_rows:
                zpid = row.get("zpid")
                pkh = row.get("property_key_hash")
                if not pkh or not zpid:
                    continue
                if zpid in processed_zpids:
                    found_zpids.add(zpid)
                    continue

                matched_prop = None
                if zpid in scraped_by_zpid:
                    matched_prop = scraped_by_zpid[zpid]
                else:
                    addr_norm = _normalize_address(
                        ", ".join(x for x in (row.get("address"), row.get("city"), row.get("state"), row.get("zipcode")) if x)
                    )
                    if addr_norm and addr_norm in scraped_by_addr:
                        matched_prop = scraped_by_addr[addr_norm]

                if matched_prop:
                    found_zpids.add(zpid)
                    processed_zpids.add(zpid)
                    _compare_and_update(client, row, matched_prop, pkh, stats)

        except Exception as e:
            print(f"[price_check] Error scraping zipcode {zipcode}: {e}")
            import traceback
            traceback.print_exc()
            stats["errors"] += 1

    # 4. Handle disappeared listings (not found in any re-scrape)
    for row in unique_props:
        zpid = row.get("zpid")
        pkh = row.get("property_key_hash")
        if not zpid or not pkh or zpid in found_zpids or zpid in processed_zpids:
            continue
        processed_zpids.add(zpid)
        current_status = row.get("listing_status")
        if current_status not in ("UNKNOWN", "PENDING", "CONTINGENT", "SOLD"):
            _handle_disappeared(client, pkh, stats)

    scraped_zips = set(by_zip.keys())
    print(f"[price_check] Done. Summary: {stats}")
    return stats, scraped_zips, scraped_data


def _compare_and_update(
    client: Client,
    db_row: dict,
    scraped: dict,
    property_key_hash: str,
    stats: dict[str, int],
) -> None:
    """Compare a DB listing with scraped data and write lifecycle entries for changes."""
    now = datetime.now(timezone.utc).isoformat()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    old_price = db_row.get("price")
    new_price = _safe_int(scraped.get("list_price") or scraped.get("price"))

    old_status = db_row.get("listing_status") or "FOR_SALE"
    raw_status = scraped.get("status") or "FOR_SALE"
    new_status = STATUS_MAP.get(raw_status.upper().replace(" ", "_"), raw_status.upper().replace(" ", "_"))

    # --- Price change ---
    if old_price and new_price and old_price != new_price:
        lifecycle = "Price Drop" if new_price < old_price else "Price Increase"
        desc = f"Auto: {_fmt_price(old_price)} -> {_fmt_price(new_price)}{_pct_change(old_price, new_price)}"
        _write_lifecycle(client, property_key_hash, lifecycle, desc, today)
        _update_listings_field(client, property_key_hash, "price", new_price)
        if lifecycle == "Price Drop":
            stats["price_drops"] += 1
        else:
            stats["price_increases"] += 1

    # --- Status change ---
    if new_status != old_status:
        # Check for Back on Market
        if new_status == "FOR_SALE" and old_status in ("PENDING", "CONTINGENT", "UNKNOWN"):
            _write_lifecycle(
                client, property_key_hash, "Back on Market",
                f"Auto: {old_status} -> FOR_SALE", today,
            )
            stats["back_on_market"] += 1
        elif new_status in LIFECYCLE_FROM_STATUS:
            lifecycle_val = LIFECYCLE_FROM_STATUS[new_status]
            _write_lifecycle(
                client, property_key_hash, lifecycle_val,
                f"Auto: {old_status} -> {new_status}", today,
            )
            stats["status_changes"] += 1

        _update_listings_field(client, property_key_hash, "listing_status", new_status)


def _handle_disappeared(
    client: Client,
    property_key_hash: str,
    stats: dict[str, int],
) -> None:
    """Mark a listing that disappeared from scrape results as Unknown."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    _write_lifecycle(
        client, property_key_hash, "Unknown",
        "Auto: Property no longer found in listing results", today,
    )
    _update_listings_field(client, property_key_hash, "listing_status", "UNKNOWN")
    stats["unknown"] += 1


def _write_lifecycle(
    client: Client,
    property_key_hash: str,
    lifecycle: str,
    description: str,
    date: str,
) -> None:
    """Insert a single property-level auto lifecycle entry (no llc_id)."""
    try:
        # Dedup: skip if identical auto entry already exists today
        since = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0).isoformat()
        existing = client.table("lifecycle").select("id").eq(
            "property_key_hash", property_key_hash
        ).eq("lifecycle", lifecycle).eq("source", "auto").eq(
            "description", description
        ).gte("created_at", since).limit(1).execute()
        if existing.data:
            return

        prop = client.table("properties").select("property_key").eq(
            "property_key_hash", property_key_hash
        ).limit(1).execute()
        property_key = prop.data[0]["property_key"] if prop.data else property_key_hash

        client.table("lifecycle").insert({
            "property_key_hash": property_key_hash,
            "property_key": property_key,
            "lifecycle": lifecycle,
            "date": date,
            "description": description,
            "source": "auto",
        }).execute()

        print(f"[price_check] Lifecycle '{lifecycle}' for {property_key_hash[:12]}...")

    except Exception as e:
        print(f"[price_check] Error writing lifecycle for {property_key_hash[:12]}...: {e}")


def _update_listings_field(
    client: Client,
    property_key_hash: str,
    field: str,
    value: Any,
) -> None:
    """Update a field on ALL listings with the given property_key_hash."""
    try:
        client.table("listings").update(
            {field: value}
        ).eq("property_key_hash", property_key_hash).execute()
    except Exception as e:
        print(f"[price_check] Error updating {field} for {property_key_hash[:12]}...: {e}")


# ---------------------------------------------------------------------------
# Phase 2 – Scrape favorite zipcodes and save new listings
# ---------------------------------------------------------------------------

def scrape_favorite_zipcodes(
    client: Client,
    already_scraped_zips: set[str],
    scraped_data: dict[str, list[dict]] | None = None,
) -> dict[str, int]:
    """
    Fetch all favorite zipcodes across LLCs, scrape for-sale listings,
    and save new listings for each LLC that favorited the zip.
    Reuses scraped data from Phase 1 for zips already scraped.
    """
    from zillow_scrapper.scrape_for_sale import scrape_for_sale_zip
    from zillow_scrapper.supabase_client import save_listing
    from zillow_scrapper.models import Listing

    if scraped_data is None:
        scraped_data = {}

    stats = {"favorite_zips_scraped": 0, "new_listings_saved": 0}

    fav_rows = _fetch_all_rows(client, "llc_favorite_zipcodes", "llc_id, zipcode")
    if not fav_rows:
        print("[favorites] No favorite zipcodes found.")
        return stats

    zip_to_llcs: dict[str, list[str]] = {}
    for row in fav_rows:
        z = row.get("zipcode")
        llc = row.get("llc_id")
        if z and llc:
            zip_to_llcs.setdefault(z, []).append(llc)

    new_zips = {z for z in zip_to_llcs if z not in already_scraped_zips}
    reused_zips = {z for z in zip_to_llcs if z in already_scraped_zips}
    print(f"[favorites] {len(zip_to_llcs)} favorite zips total, {len(reused_zips)} reused from Phase 1, {len(new_zips)} new to scrape.")

    def _save_listings_for_zip(zipcode: str, listings_data: list[dict]) -> None:
        llc_ids = zip_to_llcs.get(zipcode, [])
        if not llc_ids or not listings_data:
            return
        for ld in listings_data:
            try:
                listing = Listing.model_validate(ld)
            except Exception:
                continue
            for llc_id in llc_ids:
                saved = save_listing(client, None, listing, llc_id=llc_id)
                if saved:
                    stats["new_listings_saved"] += 1

    # Process zips already scraped in Phase 1 (reuse data, no re-scrape)
    for zipcode in reused_zips:
        listings_data = scraped_data.get(zipcode, [])
        print(f"[favorites] Reusing Phase 1 data for zip {zipcode} ({len(listings_data)} listings, {len(zip_to_llcs[zipcode])} LLC(s))...")
        _save_listings_for_zip(zipcode, listings_data)
        stats["favorite_zips_scraped"] += 1
        try:
            client.table("llc_favorite_zipcodes").update(
                {"last_scraped_at": datetime.now(timezone.utc).isoformat()}
            ).eq("zipcode", zipcode).execute()
        except Exception:
            pass

    # Scrape new zips not covered by Phase 1
    for zipcode in new_zips:
        llc_ids = zip_to_llcs[zipcode]
        print(f"[favorites] Scraping zip {zipcode} for {len(llc_ids)} LLC(s)...")
        try:
            result = scrape_for_sale_zip(zip_code=zipcode)
            listings_data = result.get("listings", [])
            if not listings_data:
                print(f"[favorites] No listings found for zip {zipcode}.")
                continue

            stats["favorite_zips_scraped"] += 1
            _save_listings_for_zip(zipcode, listings_data)

            try:
                client.table("llc_favorite_zipcodes").update(
                    {"last_scraped_at": datetime.now(timezone.utc).isoformat()}
                ).eq("zipcode", zipcode).execute()
            except Exception:
                pass

        except Exception as e:
            print(f"[favorites] Error scraping zip {zipcode}: {e}")
            import traceback
            traceback.print_exc()

    print(f"[favorites] Done. {stats}")
    return stats


# ---------------------------------------------------------------------------
# Phase 3 – Backfill sold comps for listings that have none
# ---------------------------------------------------------------------------

COMPS_BACKFILL_LIMIT = 50

def backfill_sold_comps(client: Client) -> dict[str, int]:
    """
    Find listings with zero sold comps and scrape comps for them.
    Caps at COMPS_BACKFILL_LIMIT per cycle.
    """
    from zillow_scrapper.scrape_sold_comps import scrape_sold_comps
    from zillow_scrapper.supabase_client import save_sold_comp
    from zillow_scrapper.models import Listing, SoldComp

    stats = {"listings_checked": 0, "listings_backfilled": 0, "comps_saved": 0}

    # Find listing IDs that already have comps
    comp_listing_ids: set[str] = set()
    offset = 0
    while True:
        res = client.table("sold_comps").select("listing_id").range(offset, offset + 999).execute()
        if not res.data:
            break
        for row in res.data:
            lid = row.get("listing_id")
            if lid:
                comp_listing_ids.add(lid)
        if len(res.data) < 1000:
            break
        offset += 1000

    # Fetch active listings (FOR_SALE or NULL status)
    active = _fetch_all_rows(
        client, "listings",
        "id, zpid, address, city, state, zipcode, latitude, longitude, price, beds, baths, sqft, home_type, architectural_style, days_on_zillow, agent_name, agent_phone",
        filters={"listing_status": "FOR_SALE"},
    )

    # Filter to listings without comps, cap at limit
    missing = [r for r in active if r.get("id") and r["id"] not in comp_listing_ids]
    print(f"[comps_backfill] {len(active)} active listings, {len(comp_listing_ids)} have comps, {len(missing)} missing comps.")
    missing = missing[:COMPS_BACKFILL_LIMIT]
    stats["listings_checked"] = len(missing)

    for row in missing:
        listing_id = row["id"]
        try:
            listing = Listing(
                zpid=row.get("zpid"),
                url=f"https://www.zillow.com/homedetails/{row.get('zpid', '')}_zpid/",
                address=row.get("address"),
                city=row.get("city"),
                state=row.get("state"),
                zipcode=row.get("zipcode"),
                latitude=row.get("latitude"),
                longitude=row.get("longitude"),
                price=row.get("price"),
                beds=row.get("beds"),
                baths=row.get("baths"),
                sqft=row.get("sqft"),
                home_type=row.get("home_type"),
                architectural_style=row.get("architectural_style"),
                days_on_zillow=row.get("days_on_zillow"),
                agent_name=row.get("agent_name"),
                agent_phone=row.get("agent_phone"),
            )

            if listing.latitude is None or listing.longitude is None:
                continue

            # Try 3 months first
            result = scrape_sold_comps(listing=listing, radius_miles=1.0, months_back=3)
            comps = result.get("comps", [])
            window = "3mo"

            # Fallback to 6 months if < 2 comps
            if len(comps) < 2:
                result = scrape_sold_comps(listing=listing, radius_miles=1.0, months_back=6)
                comps = result.get("comps", [])
                window = "6mo"

            if not comps:
                continue

            from uuid import UUID
            lid_uuid = UUID(listing_id)
            saved = 0
            for c in comps:
                try:
                    comp = SoldComp.model_validate(c)
                    save_sold_comp(client, lid_uuid, comp, window)
                    saved += 1
                except Exception:
                    continue

            if saved > 0:
                stats["listings_backfilled"] += 1
                stats["comps_saved"] += saved
                print(f"[comps_backfill] {listing.address or listing.zpid}: {saved} comps saved ({window})")

        except Exception as e:
            print(f"[comps_backfill] Error for listing {listing_id}: {e}")
            import traceback
            traceback.print_exc()

    print(f"[comps_backfill] Done. {stats}")
    return stats


# ---------------------------------------------------------------------------
# Orchestrator – runs all three phases
# ---------------------------------------------------------------------------

def run_cron_cycle(client: Client) -> dict[str, Any]:
    """Run all cron phases: price check, favorite zips, comps backfill."""
    print("=" * 60)
    print("[cron] Phase 1: Price & status check")
    print("=" * 60)
    price_stats, scraped_zips, scraped_data = check_price_and_status_changes(client)

    print()
    print("=" * 60)
    print("[cron] Phase 2: Favorite zipcode scrape")
    print("=" * 60)
    fav_stats = scrape_favorite_zipcodes(client, scraped_zips, scraped_data)

    print()
    print("=" * 60)
    print("[cron] Phase 3: Comps backfill")
    print("=" * 60)
    comps_stats = backfill_sold_comps(client)

    summary = {
        "price_check": price_stats,
        "favorites": fav_stats,
        "comps_backfill": comps_stats,
    }
    print(f"\n[cron] All phases complete. Summary: {summary}")
    return summary
