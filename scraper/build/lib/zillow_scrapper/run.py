from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from rich.console import Console

from zillow_scrapper.models import Listing, MatchedResult, RunInputs, RunResult, SoldComp
from zillow_scrapper.scrape_for_sale import scrape_for_sale_zip
from zillow_scrapper.scrape_sold_comps import scrape_sold_comps
from zillow_scrapper.run_state import RunState, atomic_write_json, listing_key

console = Console()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _run_id(now: datetime) -> str:
    return now.strftime("%Y%m%d_%H%M%S")


def _write_json(path: Path, payload: Any) -> None:
    atomic_write_json(path, payload)


def run_scrape(
    *,
    zip_codes: list[str],
    output_root: Path,
    headless: bool,
    user_data_dir: Optional[Path] = None,
    pause_on_captcha: bool = False,
    run_id: Optional[str] = None,
    block_pause_min_seconds: int = 60,
    block_pause_max_seconds: int = 180,
    max_listings_per_zip: Optional[int] = None,
    proxy: Optional[dict[str, str]] = None,
    cdp_url: Optional[str] = None,
) -> RunResult:
    """
    Run the scraping process using HomeHarvest.
    Note: headless, user_data_dir, cdp_url are kept for compatibility but not used with HomeHarvest.
    """
    now = _utc_now()
    run_id = run_id or _run_id(now)
    run_dir = output_root / run_id

    inputs = RunInputs(
        zip_codes=zip_codes,
        created_at=now,
        headless=headless,
        max_listings_per_zip=max_listings_per_zip,
    )

    inputs_path = run_dir / "inputs.json"
    for_sale_raw_path = run_dir / "for_sale_raw.json"
    sold_comps_raw_path = run_dir / "sold_comps_raw.json"
    matched_results_path = run_dir / "matched_results.json"
    run_state_path = run_dir / "run_state.json"
    artifacts_dir = run_dir / "artifacts"

    _write_json(inputs_path, inputs.model_dump())

    if run_state_path.exists():
        state = RunState.load(run_state_path)
    else:
        state = RunState.new(run_id, zip_codes)
        _write_json(run_state_path, state.to_dict())

    # Build proxy string from dict if provided
    proxy_string = None
    if proxy:
        server = proxy.get("server", "")
        username = proxy.get("username")
        password = proxy.get("password")
        if username and password:
            from urllib.parse import urlparse
            parsed = urlparse(server)
            proxy_string = f"{username}:{password}@{parsed.hostname}:{parsed.port}"
        else:
            from urllib.parse import urlparse
            parsed = urlparse(server)
            proxy_string = f"{parsed.hostname}:{parsed.port}"

    console.print(f"[cyan]Using HomeHarvest[/cyan] (proxy: {'yes' if proxy_string else 'no'})...")
    
    try:
        for_sale_by_zip: list[dict[str, Any]] = []
        all_listings: dict[str, Listing] = {}
        for zip_code in zip_codes:
            if state.zip_status.get(zip_code) == "done":
                console.print(f"[dim]Skipping ZIP {zip_code} (already done)[/dim]")
                continue
            console.print(f"[cyan]Scraping ZIP {zip_code}[/cyan]...")
            try:
                zip_result = scrape_for_sale_zip(
                    zip_code=zip_code,
                    max_listings=max_listings_per_zip,
                    proxy=proxy_string,
                )
            except Exception as e:
                zip_result = {
                    "zip_code": zip_code,
                    "listings": [],
                    "raw_search_responses_count": 0,
                    "raw_search_responses_sample": [],
                    "error": f"scrape_for_sale_zip_failed: {type(e).__name__}: {e}",
                }
            for_sale_by_zip.append(zip_result)
            # Write incrementally so progress persists even if run crashes.
            _write_json(for_sale_raw_path, {"run_id": run_id, "by_zip": for_sale_by_zip})

            listings_count = len(zip_result.get("listings", []))
            console.print(f"[green]Found {listings_count} listings for ZIP {zip_code}[/green]")
            for listing_dict in zip_result.get("listings", []):
                listing = Listing.model_validate(listing_dict)
                key = listing.zpid or listing.url
                all_listings[key] = listing
            state.zip_status[zip_code] = "done"
            _write_json(run_state_path, state.to_dict())
            # Already written incrementally above, but ensure final state.
            _write_json(for_sale_raw_path, {"run_id": run_id, "by_zip": for_sale_by_zip})

        sold_by_listing: list[dict[str, Any]] = []
        matched_results: list[dict[str, Any]] = []

        total_listings = len(all_listings)
        console.print(f"[cyan]Searching sold comps for {total_listings} listings in batches of 5...[/cyan]")
        
        # Filter out already processed listings
        listings_to_process = [
            listing for listing in all_listings.values()
            if state.listing_status.get(listing_key(listing.zpid, listing.url)) != "done"
        ]
        
        def process_listing(listing: Listing) -> tuple[str, dict[str, Any], list[dict[str, Any]], str]:
            """Process a single listing and return results."""
            lk = listing_key(listing.zpid, listing.url)
            address_display = listing.address or listing.city or listing.zpid or "Unknown"
            
            # First attempt: last 3 months.
            sold_3 = scrape_sold_comps(
                listing=listing,
                radius_miles=1.0,
                months_back=3,
                proxy=proxy_string,
            )
            comps_3 = sold_3.get("comps", [])

            chosen_window = "3mo"
            chosen_comps = comps_3
            chosen_payload = sold_3

            # Fallback: if nothing found or less than 2, search last 6 months.
            if len(comps_3) < 2:
                sold_6 = scrape_sold_comps(
                    listing=listing,
                    radius_miles=1.0,
                    months_back=6,
                    proxy=proxy_string,
                )
                chosen_window = "6mo"
                chosen_comps = sold_6.get("comps", [])
                chosen_payload = sold_6

            return lk, chosen_payload, chosen_comps, chosen_window
        
        # Process in batches of 5
        batch_size = 5
        processed = len(all_listings) - len(listings_to_process)
        
        for batch_start in range(0, len(listings_to_process), batch_size):
            batch = listings_to_process[batch_start:batch_start + batch_size]
            batch_num = (batch_start // batch_size) + 1
            total_batches = (len(listings_to_process) + batch_size - 1) // batch_size
            
            console.print(f"[cyan]Processing batch {batch_num}/{total_batches} ({len(batch)} listings)...[/cyan]")
            
            # Process batch in parallel
            with ThreadPoolExecutor(max_workers=5) as executor:
                future_to_listing = {
                    executor.submit(process_listing, listing): listing
                    for listing in batch
                }
                
                for future in as_completed(future_to_listing):
                    listing = future_to_listing[future]
                    try:
                        lk, chosen_payload, chosen_comps, chosen_window = future.result()
                        
                        processed += 1
                        address_display = listing.address or listing.city or listing.zpid or "Unknown"
                        
                        sold_by_listing.append(chosen_payload)

                        if len(chosen_comps) >= 1:
                            comps_models = [SoldComp.model_validate(c) for c in chosen_comps]
                            mr = MatchedResult(
                                listing=listing,
                                comps=comps_models,
                                comp_search_window=chosen_window,  # type: ignore[arg-type]
                            )
                            matched_results.append(mr.model_dump())
                            console.print(f"  [{processed}/{total_listings}] [green]✓[/green] {address_display[:50]}... - {len(chosen_comps)} comps ({chosen_window})")
                        else:
                            console.print(f"  [{processed}/{total_listings}] [yellow]⚠[/yellow] {address_display[:50]}... - No comps found")

                        state.listing_status[lk] = "done"
                        _write_json(run_state_path, state.to_dict())
                        
                        # Write matched results incrementally
                        _write_json(matched_results_path, {"run_id": run_id, "results": matched_results})
                    except Exception as e:
                        processed += 1
                        address_display = listing.address or listing.city or listing.zpid or "Unknown"
                        console.print(f"  [{processed}/{total_listings}] [red]✗[/red] {address_display[:50]}... - Error: {e}")
                        state.listing_status[listing_key(listing.zpid, listing.url)] = "done"
                        _write_json(run_state_path, state.to_dict())

        _write_json(sold_comps_raw_path, {"run_id": run_id, "by_listing": sold_by_listing})
        _write_json(matched_results_path, {"run_id": run_id, "results": matched_results})
    finally:
        pass  # No browser to close with HomeHarvest

    return RunResult(
        run_id=run_id,
        run_dir=str(run_dir),
        inputs_path=str(inputs_path),
        for_sale_raw_path=str(for_sale_raw_path),
        sold_comps_raw_path=str(sold_comps_raw_path),
        matched_results_path=str(matched_results_path),
    )
