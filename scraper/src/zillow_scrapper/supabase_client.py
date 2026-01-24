from __future__ import annotations

import os
import ssl
import urllib3
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx
from supabase import create_client, Client

from zillow_scrapper.models import Listing, MatchedResult, SoldComp

# Disable SSL verification for development (same issue as Node.js)
# httpx uses httpcore which doesn't respect ssl._create_default_https_context
# We need to set environment variable or configure httpx directly
import os
os.environ["PYTHONHTTPSVERIFY"] = "0"


def get_supabase_client() -> Optional[Client]:
    """Initialize and return Supabase client if credentials are available."""
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

    # Debug: Print what we got (without exposing the full key)
    print(f"[DEBUG] SUPABASE_URL env var: {'SET' if supabase_url else 'NOT SET'}")
    print(f"[DEBUG] SUPABASE_SERVICE_ROLE_KEY env var: {'SET' if supabase_key else 'NOT SET'}")
    if supabase_url:
        print(f"[DEBUG] SUPABASE_URL value: {supabase_url}")
    if supabase_key:
        print(f"[DEBUG] SUPABASE_SERVICE_ROLE_KEY starts with: {supabase_key[:10]}...")

    if not supabase_url or not supabase_key:
        print("[yellow]Warning: Supabase credentials not found. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.[/yellow]")
        print(f"[DEBUG] Missing: URL={supabase_url is None}, KEY={supabase_key is None}")
        return None

    try:
        # Monkey-patch httpx.Client to always disable SSL verification
        # This is necessary because httpx/httpcore doesn't respect Python's ssl module patches
        original_init = httpx.Client.__init__
        
        def patched_init(self, *args, verify=True, **kwargs):
            # Force verify=False for all httpx clients
            return original_init(self, *args, verify=False, **kwargs)
        
        # Only patch if not already patched
        if httpx.Client.__init__.__name__ != "patched_init":
            httpx.Client.__init__ = patched_init
        
        # Set environment variables as backup
        os.environ["PYTHONHTTPSVERIFY"] = "0"
        os.environ["CURL_CA_BUNDLE"] = ""
        os.environ["REQUESTS_CA_BUNDLE"] = ""
        
        # Create Supabase client (it will use our patched httpx.Client)
        client = create_client(supabase_url, supabase_key)
        print("[green]✓ Supabase client created successfully[/green]")
        return client
    except Exception as e:
        print(f"[red]Error: Failed to create Supabase client: {e}[/red]")
        import traceback
        traceback.print_exc()
        return None


def create_run(
    client: Client,
    run_id: str,
    zip_codes: list[str],
    max_listings_per_zip: Optional[int] = None,
) -> Optional[UUID]:
    """Create or get a run record in Supabase. Returns the UUID of the run."""
    try:
        # First check if run already exists
        existing = get_run_uuid(client, run_id)
        if existing:
            return existing

        # Create new run if it doesn't exist
        result = client.table("runs").insert(
            {
                "run_id": run_id,
                "zip_codes": zip_codes,
                "status": "pending",
                "max_listings_per_zip": max_listings_per_zip,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        if result.data and len(result.data) > 0:
            return UUID(result.data[0]["id"])
        return None
    except Exception as e:
        print(f"[yellow]Warning: Failed to create/get run in Supabase: {e}[/yellow]")
        return None


def update_run_status(
    client: Client,
    run_id: str,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Update run status in Supabase."""
    try:
        update_data: dict[str, any] = {"status": status}
        if status == "completed":
            update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
        if error_message:
            update_data["error_message"] = error_message

        client.table("runs").update(update_data).eq("run_id", run_id).execute()
    except Exception as e:
        print(f"[yellow]Warning: Failed to update run status in Supabase: {e}[/yellow]")


def get_run_uuid(client: Client, run_id: str) -> Optional[UUID]:
    """Get the UUID of a run by its run_id."""
    try:
        result = client.table("runs").select("id").eq("run_id", run_id).execute()
        if result.data and len(result.data) > 0:
            return UUID(result.data[0]["id"])
        return None
    except Exception as e:
        print(f"[yellow]Warning: Failed to get run UUID from Supabase: {e}[/yellow]")
        return None


def save_listing(client: Client, run_uuid: UUID, listing: Listing) -> Optional[UUID]:
    """Save a listing to Supabase. Returns the UUID of the created listing."""
    try:
        result = client.table("listings").insert(
            {
                "run_id": str(run_uuid),
                "zpid": listing.zpid,
                "url": listing.url,
                "address": listing.address,
                "zipcode": listing.zipcode,
                "city": listing.city,
                "state": listing.state,
                "latitude": listing.latitude,
                "longitude": listing.longitude,
                "price": listing.price,
                "beds": listing.beds,
                "baths": listing.baths,
                "sqft": listing.sqft,
                "home_type": listing.home_type,
                "architectural_style": listing.architectural_style,
                "days_on_zillow": listing.days_on_zillow,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()

        if result.data and len(result.data) > 0:
            listing_id = UUID(result.data[0]["id"])
            print(f"[green]Saved listing {listing_id} to Supabase[/green]")
            return listing_id
        else:
            print(f"[yellow]Warning: Failed to save listing to Supabase: No data returned[/yellow]")
            if hasattr(result, 'error') and result.error:
                print(f"[yellow]Error details: {result.error}[/yellow]")
            return None
    except Exception as e:
        print(f"[red]Error: Failed to save listing to Supabase: {e}[/red]")
        import traceback
        traceback.print_exc()
        return None


def save_sold_comp(client: Client, listing_uuid: UUID, comp: SoldComp, comp_search_window: str) -> None:
    """Save a sold comp to Supabase."""
    try:
        result = client.table("sold_comps").insert(
            {
                "listing_id": str(listing_uuid),
                "zpid": comp.zpid,
                "url": comp.url,
                "address": comp.address,
                "zipcode": comp.zipcode,
                "city": comp.city,
                "state": comp.state,
                "latitude": comp.latitude,
                "longitude": comp.longitude,
                "sold_price": comp.sold_price,
                "sold_date": comp.sold_date.isoformat() if comp.sold_date else None,
                "beds": comp.beds,
                "baths": comp.baths,
                "sqft": comp.sqft,
                "home_type": comp.home_type,
                "architectural_style": comp.architectural_style,
                "distance_miles": comp.distance_miles,
                "comp_search_window": comp_search_window,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
        if not result.data:
            print(f"[yellow]Warning: Failed to save sold comp to Supabase: No data returned[/yellow]")
    except Exception as e:
        print(f"[yellow]Warning: Failed to save sold comp to Supabase: {e}[/yellow]")
        import traceback
        traceback.print_exc()


def save_matched_result(client: Client, run_uuid: UUID, matched_result: MatchedResult) -> None:
    """Save a matched result (listing + comps) to Supabase."""
    if not client:
        print("[yellow]Warning: No Supabase client available[/yellow]")
        return

    if not run_uuid:
        print("[yellow]Warning: No run UUID provided[/yellow]")
        return

    print(f"[dim]Saving matched result: listing {matched_result.listing.address or matched_result.listing.url} with {len(matched_result.comps)} comps[/dim]")

    # Save the listing first
    listing_uuid = save_listing(client, run_uuid, matched_result.listing)
    if not listing_uuid:
        print(f"[red]Error: Failed to save listing to Supabase, skipping comps[/red]")
        return

    # Save all comps
    comps_saved = 0
    for i, comp in enumerate(matched_result.comps):
        try:
            save_sold_comp(client, listing_uuid, comp, matched_result.comp_search_window)
            comps_saved += 1
        except Exception as e:
            print(f"[red]Error: Failed to save comp {i+1}: {e}[/red]")
            import traceback
            traceback.print_exc()
    
    print(f"[green]✓ Saved listing with {comps_saved}/{len(matched_result.comps)} comps to Supabase[/green]")
