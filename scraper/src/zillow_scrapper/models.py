from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Listing(BaseModel):
    zpid: Optional[str] = None
    url: str

    address: Optional[str] = None
    zipcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    price: Optional[int] = None
    beds: Optional[float] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None

    home_type: Optional[str] = None
    architectural_style: Optional[str] = None
    days_on_zillow: Optional[int] = None

    agent_name: Optional[str] = None
    agent_phone: Optional[str] = None


class SoldComp(BaseModel):
    zpid: Optional[str] = None
    url: str

    address: Optional[str] = None
    zipcode: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    sold_price: Optional[int] = None
    sold_date: Optional[date] = None
    beds: Optional[float] = None
    baths: Optional[float] = None
    sqft: Optional[int] = None
    home_type: Optional[str] = None
    architectural_style: Optional[str] = None

    distance_miles: Optional[float] = None


CompSearchWindow = Literal["3mo", "6mo"]


class MatchedResult(BaseModel):
    listing: Listing
    comps: list[SoldComp] = Field(default_factory=list)
    comp_search_window: CompSearchWindow

    @property
    def comp_count(self) -> int:
        return len(self.comps)


class RunInputs(BaseModel):
    zip_codes: list[str]
    created_at: datetime
    headless: bool
    max_listings_per_zip: Optional[int] = None


class RunResult(BaseModel):
    run_id: str
    run_dir: str
    inputs_path: str
    for_sale_raw_path: str
    sold_comps_raw_path: str
    matched_results_path: str

