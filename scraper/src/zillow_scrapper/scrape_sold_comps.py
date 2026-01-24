from __future__ import annotations

import json
import ssl
from datetime import date, timedelta
from typing import Any, Optional

import requests
import urllib3

# Fix SSL certificate issues on macOS
# Patch SSL and requests BEFORE importing homeharvest
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Patch requests.post and Session.post to disable SSL verification
original_post = requests.post
def patched_post(*args, **kwargs):
    kwargs['verify'] = False
    return original_post(*args, **kwargs)
requests.post = patched_post

original_session_post = requests.Session.post
def patched_session_post(self, *args, **kwargs):
    kwargs['verify'] = False
    return original_session_post(self, *args, **kwargs)
requests.Session.post = patched_session_post

# Now import homeharvest after patching
from homeharvest import scrape_property

from zillow_scrapper.geo import haversine_miles
from zillow_scrapper.models import Listing, SoldComp
from zillow_scrapper.parsing import coerce_float, coerce_int, extract_architectural_style


def scrape_sold_comps(
    *,
    listing: Listing,
    radius_miles: float,
    months_back: int,
    proxy: Optional[str] = None,
) -> dict[str, Any]:
    """
    Scrape sold comps for a listing using HomeHarvest.
    """
    if listing.latitude is None or listing.longitude is None:
        return {"listing": listing.model_dump(), "months_back": months_back, "comps": [], "error": "missing_lat_lon"}

    captured_comps: dict[str, SoldComp] = {}
    
    try:
        # Calculate date range for sold properties
        end_date = date.today()
        start_date = end_date - timedelta(days=months_back * 30)
        
        # Build location string from listing
        location_parts = []
        if listing.city:
            location_parts.append(listing.city)
        if listing.state:
            location_parts.append(listing.state)
        if listing.zipcode:
            location_parts.append(listing.zipcode)
        
        location = ", ".join(location_parts) if location_parts else str(listing.zipcode or "")
        
        # Build proxy string if provided
        proxy_string = None
        if proxy:
            proxy_string = proxy
        
        # Scrape sold properties
        # Use past_days to filter by months_back
        past_days = months_back * 30
        properties_df = scrape_property(
            location=location,
            listing_type="sold",
            past_days=past_days,
            proxy=proxy_string,
        )
        
        # Filter by date and distance
        if properties_df is not None and len(properties_df) > 0:
            raw_data = properties_df.to_dict(orient="records")
            
            for prop in raw_data:
                try:
                    # Extract URL
                    url = prop.get("property_url") or prop.get("url") or ""
                    if not url:
                        continue
                    
                    # Extract ZPID
                    zpid = str(prop.get("zpid") or prop.get("mls_id") or "") or None
                    
                    # Extract address components
                    address = (
                        prop.get("formatted_address") or 
                        prop.get("full_street_line") or 
                        prop.get("street_address") or 
                        prop.get("street") or 
                        prop.get("address")
                    )
                    city = prop.get("city")
                    state = prop.get("state")
                    zipcode = str(prop.get("zip_code") or prop.get("zipcode") or "") or None
                    
                    # Extract location
                    comp_lat = coerce_float(prop.get("latitude") or prop.get("lat"))
                    comp_lon = coerce_float(prop.get("longitude") or prop.get("lon") or prop.get("lng"))
                    
                    # Calculate distance from listing
                    distance_miles: Optional[float] = None
                    if listing.latitude and listing.longitude and comp_lat and comp_lon:
                        distance_miles = haversine_miles(
                            lat1=listing.latitude,
                            lon1=listing.longitude,
                            lat2=comp_lat,
                            lon2=comp_lon,
                        )
                        # Filter by radius
                        if distance_miles > radius_miles:
                            continue
                    
                    # Extract sold details
                    sold_price = coerce_int(prop.get("sold_price") or prop.get("last_sold_price") or prop.get("price"))
                    sold_date_str = prop.get("sold_date") or prop.get("last_sold_date")
                    sold_date = None
                    if sold_date_str:
                        try:
                            # Try to parse various date formats
                            if isinstance(sold_date_str, str):
                                from dateutil import parser
                                sold_date = parser.parse(sold_date_str).date()
                            elif isinstance(sold_date_str, date):
                                sold_date = sold_date_str
                        except Exception:
                            pass
                    
                    # Filter by date range if we have sold_date
                    if sold_date and (sold_date < start_date or sold_date > end_date):
                        continue
                    
                    # Extract property details
                    beds = coerce_float(prop.get("beds") or prop.get("bedrooms") or prop.get("bed"))
                    
                    # Calculate total baths from full_baths and half_baths
                    full_baths = coerce_float(prop.get("full_baths") or prop.get("full_bathrooms"))
                    half_baths = coerce_float(prop.get("half_baths") or prop.get("half_bathrooms"))
                    baths = None
                    if full_baths is not None:
                        baths = full_baths + (half_baths * 0.5 if half_baths else 0)
                    if baths is None:
                        baths = coerce_float(prop.get("bathrooms") or prop.get("baths") or prop.get("bath"))
                    
                    # Try multiple field names for sqft, including area-related fields
                    # Note: sqft=0 might mean missing data, so we check other fields
                    sqft_raw = prop.get("sqft")
                    sqft = None
                    # Only use sqft if it's a valid positive number
                    if sqft_raw and (isinstance(sqft_raw, (int, float)) and sqft_raw > 0):
                        sqft = coerce_int(sqft_raw)
                    # If sqft is 0 or missing, try other fields
                    if not sqft:
                        sqft = (
                            coerce_int(prop.get("square_feet")) or
                            coerce_int(prop.get("square_footage")) or
                            coerce_int(prop.get("area")) or
                            coerce_int(prop.get("building_area")) or
                            coerce_int(prop.get("living_area")) or
                            coerce_int(prop.get("interior_area")) or
                            coerce_int(prop.get("finished_area")) or
                            coerce_int(prop.get("heated_area")) or
                            coerce_int(prop.get("total_area")) or
                            coerce_int(prop.get("above_grade_sqft")) or
                            coerce_int(prop.get("finished_sqft"))
                        )
                    # Last resort: if sqft is 0 and lot_sqft exists and is reasonable for building sqft (< 15000),
                    # use it as fallback (sometimes HomeHarvest has data quality issues)
                    if not sqft or sqft == 0:
                        lot_sqft = coerce_int(prop.get("lot_sqft"))
                        if lot_sqft and 0 < lot_sqft < 15000:  # Reasonable range for building sqft
                            sqft = lot_sqft
                    # Extract architectural style - ALWAYS use architectural_style field if available
                    comp_architectural_style = (
                        prop.get("architectural_style") or
                        prop.get("architectural_type") or
                        prop.get("property_subtype") or
                        prop.get("style_type") or
                        prop.get("home_style") or
                        None
                    )
                    
                    # Normalize the architectural style if found
                    if comp_architectural_style and isinstance(comp_architectural_style, str):
                        comp_architectural_style = comp_architectural_style.strip().title()
                    elif comp_architectural_style:
                        comp_architectural_style = str(comp_architectural_style).strip().title()
                    else:
                        comp_architectural_style = None
                    
                    # Only extract from description text if no architectural_style field exists
                    if not comp_architectural_style:
                        comp_description_text = prop.get("text") or prop.get("description") or ""
                        if comp_description_text:
                            comp_architectural_style = extract_architectural_style(
                                text=comp_description_text,
                                direct_field=None
                            )
                    
                    # Get comp_home_type
                    comp_home_type = prop.get("style") or prop.get("property_type") or prop.get("home_type")
                    
                    # Filter by matching architectural_style if listing has one
                    if listing.architectural_style and comp_architectural_style:
                        if listing.architectural_style.lower() != comp_architectural_style.lower():
                            continue  # Skip comps that don't match the listing's architectural style
                    
                    comp = SoldComp(
                        zpid=zpid,
                        url=url,
                        address=address,
                        zipcode=zipcode,
                        city=city,
                        state=state,
                        latitude=comp_lat,
                        longitude=comp_lon,
                        sold_price=sold_price,
                        sold_date=sold_date,
                        beds=beds,
                        baths=baths,
                        sqft=sqft,
                        home_type=comp_home_type,
                        architectural_style=comp_architectural_style,
                        distance_miles=distance_miles,
                    )
                    
                    key = comp.zpid or comp.url
                    captured_comps[key] = comp
                except Exception:
                    # Skip properties that can't be parsed
                    continue
        
        # Sort comps by distance (closest first) and limit to 10 closest
        comps_sorted = list(captured_comps.values())
        # Sort by distance_miles, putting None values last
        comps_sorted.sort(key=lambda c: (c.distance_miles is None, c.distance_miles or float('inf')))
        # Limit to 10 closest
        comps_sorted = comps_sorted[:10]
        
        return {
            "listing": listing.model_dump(),
            "months_back": months_back,
            "final_url": f"https://www.zillow.com/homes/{listing.zipcode}_rb/",
            "title": f"Sold Properties near {listing.address or listing.zipcode}",
            "blocked_by_captcha": False,
            "comps": [c.model_dump() for c in comps_sorted],
            "raw_search_responses_count": 0,
            "raw_search_responses_sample": [],
            "observed_json_response_urls_count": 0,
            "observed_json_response_urls_sample": [],
        }
        
    except Exception as e:
        return {
            "listing": listing.model_dump(),
            "months_back": months_back,
            "comps": [],
            "error": f"homeharvest_scrape_sold_comps_failed: {type(e).__name__}: {e}",
        }
