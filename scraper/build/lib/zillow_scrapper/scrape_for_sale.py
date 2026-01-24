from __future__ import annotations

import json
import os
import ssl
from typing import Any, Optional

import certifi
import requests
import urllib3

# Fix SSL certificate issues on macOS
# Patch SSL and requests BEFORE importing homeharvest
ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Patch requests.post and Session.post to disable SSL verification
# This must be done before homeharvest imports requests
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

import pandas as pd

from zillow_scrapper.models import Listing
from zillow_scrapper.parsing import coerce_float, coerce_int, extract_architectural_style


def scrape_for_sale_zip(
    *,
    zip_code: str,
    max_listings: Optional[int] = None,
    proxy: Optional[str] = None,
) -> dict[str, Any]:
    """
    Scrape for-sale listings for a ZIP code using HomeHarvest.
    
    Returns a dict with:
    - listings: normalized listings
    - raw_search_responses: list of captured JSON payloads (truncated) useful for debugging
    """
    captured_payloads: list[Any] = []
    captured_listings: dict[str, Listing] = {}
    
    try:
        # Use HomeHarvest to scrape properties
        # Note: HomeHarvest primarily uses Realtor.com, not Zillow directly
        # Location can be zip code, city/state, or address
        location = f"{zip_code}"
        
        # Build proxy string if provided
        proxy_string = None
        if proxy:
            proxy_string = proxy
        
        # Scrape properties with pagination
        # HomeHarvest uses Realtor.com and has page size of 200
        # Use pagination to get all available properties
        all_properties = []
        page_size = 200
        offset = 0
        
        while True:
            page_df = scrape_property(
                location=location,
                listing_type="for_sale",
                proxy=proxy_string,
                limit=page_size,
                offset=offset,
            )
            
            if page_df is None or len(page_df) == 0:
                break
            
            all_properties.append(page_df)
            
            # If we got fewer than page_size, we've reached the end
            if len(page_df) < page_size:
                break
            
            # If max_listings is set, check if we have enough
            if max_listings and len(all_properties) * page_size >= max_listings:
                break
            
            offset += page_size
        
        # Combine all pages
        if all_properties:
            properties_df = pd.concat(all_properties, ignore_index=True)
            # Remove duplicates based on URL or MLS ID
            if 'property_url' in properties_df.columns:
                properties_df = properties_df.drop_duplicates(subset=['property_url'], keep='first')
            elif 'mls_id' in properties_df.columns:
                properties_df = properties_df.drop_duplicates(subset=['mls_id'], keep='first')
            
            # Apply max_listings limit if set
            if max_listings and len(properties_df) > max_listings:
                properties_df = properties_df.head(max_listings)
        else:
            properties_df = None
        
        # Convert DataFrame to list of dicts for raw output
        if properties_df is not None and len(properties_df) > 0:
            raw_data = properties_df.to_dict(orient="records")
            captured_payloads.extend(raw_data)
            
            # Convert to our Listing model
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
                    zipcode = str(prop.get("zip_code") or prop.get("zipcode") or zip_code) or None
                    
                    # Extract location
                    latitude = coerce_float(prop.get("latitude") or prop.get("lat"))
                    longitude = coerce_float(prop.get("longitude") or prop.get("lon") or prop.get("lng"))
                    
                    # Extract property details
                    price = coerce_int(prop.get("list_price") or prop.get("price"))
                    beds = coerce_float(prop.get("beds") or prop.get("bedrooms") or prop.get("bed"))
                    
                    # Calculate total baths from full_baths and half_baths
                    full_baths = coerce_float(prop.get("full_baths") or prop.get("full_bathrooms"))
                    half_baths = coerce_float(prop.get("half_baths") or prop.get("half_bathrooms"))
                    baths = None
                    if full_baths is not None:
                        baths = full_baths + (half_baths * 0.5 if half_baths else 0)
                    if baths is None:
                        baths = coerce_float(prop.get("bathrooms") or prop.get("baths") or prop.get("bath"))
                    
                    sqft = coerce_int(prop.get("sqft") or prop.get("square_feet") or prop.get("square_footage"))
                    home_type = prop.get("style") or prop.get("property_type") or prop.get("home_type")
                    days_on_zillow = coerce_int(prop.get("days_on_mls") or prop.get("days_on_market") or prop.get("days_on_zillow"))
                    
                    # Extract architectural style from description text
                    description_text = prop.get("text") or prop.get("description") or ""
                    architectural_style = extract_architectural_style(description_text)
                    
                    listing = Listing(
                        zpid=zpid,
                        url=url,
                        address=address,
                        zipcode=zipcode,
                        city=city,
                        state=state,
                        latitude=latitude,
                        longitude=longitude,
                        price=price,
                        beds=beds,
                        baths=baths,
                        sqft=sqft,
                        home_type=home_type,
                        architectural_style=architectural_style,
                        days_on_zillow=days_on_zillow,
                    )
                    
                    key = listing.zpid or listing.url
                    captured_listings[key] = listing
                except Exception as e:
                    # Skip properties that can't be parsed
                    continue
        
        # Limit results if requested
        listings_sorted = list(captured_listings.values())
        if max_listings is not None:
            listings_sorted = listings_sorted[:max_listings]
        
        return {
            "zip_code": zip_code,
            "final_url": f"https://www.zillow.com/homes/{zip_code}_rb/",
            "title": f"{zip_code} Real Estate - {zip_code} Homes For Sale | Zillow",
            "blocked_by_captcha": False,
            "triggered": True,
            "waited_for_search_response_ms": 0,
            "trigger_actions_performed": ["homeharvest_scrape"],
            "listings": [l.model_dump() for l in listings_sorted],
            "raw_search_responses_count": len(captured_payloads),
            "raw_search_responses_sample": json.loads(
                json.dumps(captured_payloads[:3], default=str)
            ),
            "observed_json_response_urls_count": 0,
            "observed_json_response_urls_sample": [],
        }
        
    except Exception as e:
        return {
            "zip_code": zip_code,
            "final_url": None,
            "title": None,
            "blocked_by_captcha": None,
            "listings": [],
            "raw_search_responses_count": 0,
            "raw_search_responses_sample": [],
            "error": f"homeharvest_scrape_failed: {type(e).__name__}: {e}",
            "target_url": f"https://www.zillow.com/homes/{zip_code}_rb/",
        }
