from __future__ import annotations

from urllib.parse import quote


def for_sale_zip_url(zip_code: str) -> str:
    # Zillow URLs are not stable; we’ll use a conservative “homes” URL and rely on page JSON/network parsing.
    # Example: https://www.zillow.com/homes/44101_rb/
    return f"https://www.zillow.com/homes/{quote(zip_code)}_rb/"


def sold_comps_url(lat: float, lon: float, radius_miles: float, months_back: int) -> str:
    # We keep the URL simple and apply filters via query state if/when we extract it.
    # For robustness, start from a map-bounds query using a small bbox based on radius.
    # Actual bbox is computed elsewhere; this function is a placeholder to keep call sites tidy.
    return f"https://www.zillow.com/homes/recently_sold/?searchQueryState={{}}&lat={lat}&lon={lon}&r={radius_miles}&m={months_back}"

