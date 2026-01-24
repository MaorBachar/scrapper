"""
FastAPI HTTP API wrapper for the Zillow scraper.
Deploy this to Vercel or another serverless platform.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

# Add src directory to Python path for Vercel deployment
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
if src_dir.exists() and str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from zillow_scrapper.run import run_scrape

app = FastAPI(title="Zillow Scraper API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScrapeRequest(BaseModel):
    zip_codes: list[str]
    max_listings_per_zip: Optional[int] = None
    run_id: Optional[str] = None


class ScrapeResponse(BaseModel):
    run_id: str
    status: str
    message: str


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Zillow Scraper API"}


def _run_scrape_task(
    zip_codes: list[str],
    run_id: Optional[str],
    max_listings_per_zip: Optional[int],
    output_root: Path,
):
    """Background task to run the scraper."""
    try:
        run_scrape(
            zip_codes=zip_codes,
            output_root=output_root,
            headless=True,  # Always headless in serverless
            user_data_dir=None,
            pause_on_captcha=False,
            run_id=run_id,
            block_pause_min_seconds=60,
            block_pause_max_seconds=180,
            max_listings_per_zip=max_listings_per_zip,
            proxy=None,
            cdp_url=None,
        )
    except Exception as e:
        print(f"[ERROR] Scrape task failed: {e}")
        import traceback
        traceback.print_exc()


@app.post("/api/scrape", response_model=ScrapeResponse)
async def scrape(request: ScrapeRequest):
    """
    Start a scraping job.
    
    This endpoint accepts a scrape request and starts the scraping process
    asynchronously. It returns immediately with the run_id.
    
    Note: In serverless environments (like Vercel), the scrape will run in the
    background until the function times out. Data is saved incrementally to
    Supabase, so results persist even if the function times out.
    """
    if not request.zip_codes:
        raise HTTPException(status_code=400, detail="zip_codes must be a non-empty list")
    
    # Generate run_id if not provided (matching Next.js format)
    if not request.run_id:
        from datetime import datetime
        now = datetime.now()
        run_id = now.strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
    else:
        run_id = request.run_id
    
    # Use a temporary output directory for serverless environments
    # In Vercel, we can't write to disk reliably, so data will only be saved to Supabase
    output_root = Path("/tmp/data/runs") if os.path.exists("/tmp") else Path("data/runs")
    output_root.mkdir(parents=True, exist_ok=True)
    
    # Start the scraper in a background task
    # Return immediately - the scrape will continue running
    loop = asyncio.get_event_loop()
    loop.run_in_executor(
        None,
        _run_scrape_task,
        request.zip_codes,
        run_id,
        request.max_listings_per_zip,
        output_root,
    )
    
    return ScrapeResponse(
        run_id=run_id,
        status="pending",
        message="Scraper started successfully",
    )


# For Vercel serverless functions
# Export the app for Vercel's Python runtime
# Vercel will automatically detect and use the FastAPI app
