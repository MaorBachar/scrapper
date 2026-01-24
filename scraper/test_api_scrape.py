#!/usr/bin/env python3
"""Test script to debug the scraper API locally."""
import os
import sys
from pathlib import Path

# Add src to path
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
if src_dir.exists() and str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

# Set Supabase credentials for testing
os.environ["SUPABASE_URL"] = "https://akxpakrvrhiorlclhdug.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "sb_secret_w41-Wcrx8ocuvJDktVnxQQ_y8ku99mq"

from zillow_scrapper.run import run_scrape

if __name__ == "__main__":
    print("=" * 60)
    print("Testing scraper with Supabase")
    print("=" * 60)
    
    # Test with a small number of listings
    result = run_scrape(
        zip_codes=["44125"],
        output_root=Path("data/runs"),
        headless=True,
        user_data_dir=None,
        pause_on_captcha=False,
        run_id=None,  # Let it generate
        block_pause_min_seconds=60,
        block_pause_max_seconds=180,
        max_listings_per_zip=3,  # Small test
        proxy=None,
        cdp_url=None,
    )
    
    print("\n" + "=" * 60)
    print("Scraper completed!")
    print(f"Run ID: {result.run_id}")
    print(f"Total listings: {result.total_listings}")
    print(f"Total comps: {result.total_comps}")
    print("=" * 60)
