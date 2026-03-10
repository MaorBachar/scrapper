"""
FastAPI HTTP API wrapper for the Zillow scraper.
Deploy this to Vercel or another serverless platform.
"""
from __future__ import annotations

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

# Add src directory to Python path for Vercel deployment
current_dir = Path(__file__).parent
src_dir = current_dir / "src"
if src_dir.exists() and str(src_dir) not in sys.path:
    sys.path.insert(0, str(src_dir))

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from zillow_scrapper.run import run_scrape

CRON_SECRET = os.getenv("CRON_SECRET", "")
PRICE_CHECK_INTERVAL_HOURS = int(os.getenv("PRICE_CHECK_INTERVAL_HOURS", "2"))


async def _price_check_loop():
    """Background loop that runs the full cron cycle on a fixed interval."""
    interval_seconds = PRICE_CHECK_INTERVAL_HOURS * 3600
    await asyncio.sleep(60)
    while True:
        try:
            print(f"[SCHEDULER] Starting cron cycle (price check + favorites + comps backfill)...")
            loop = asyncio.get_event_loop()
            from zillow_scrapper.supabase_client import get_supabase_client
            from zillow_scrapper.price_check import run_cron_cycle

            client = get_supabase_client()
            if client:
                summary = await loop.run_in_executor(None, run_cron_cycle, client)
                print(f"[SCHEDULER] Cron cycle completed: {summary}")
            else:
                print("[SCHEDULER] Supabase client not available, skipping.")
        except Exception as e:
            print(f"[SCHEDULER] Cron cycle failed: {e}")
            import traceback
            traceback.print_exc()
        await asyncio.sleep(interval_seconds)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_price_check_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Zillow Scraper API", lifespan=lifespan)

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
    mode: Optional[str] = "full"


class ScrapeResponse(BaseModel):
    run_id: str
    status: str
    message: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Zillow Scraper API"}


def _run_scrape_task(
    zip_codes: list[str],
    run_id: Optional[str],
    max_listings_per_zip: Optional[int],
    output_root: Path,
    mode: str = "full",
):
    """Background task to run the scraper."""
    try:
        print(f"[API] Starting scrape task for run_id: {run_id}, zip_codes: {zip_codes}, mode: {mode}")
        result = run_scrape(
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
            mode=mode,
        )
        print(f"[API] Scrape task completed for run_id: {run_id}")
        return result
    except Exception as e:
        print(f"[ERROR] Scrape task failed for run_id {run_id}: {e}")
        import traceback
        traceback.print_exc()
        # Try to update status to failed in Supabase
        try:
            from zillow_scrapper.supabase_client import get_supabase_client, update_run_status
            supabase_client = get_supabase_client()
            if supabase_client and run_id:
                update_run_status(supabase_client, run_id, "failed", str(e))
        except Exception as update_error:
            print(f"[ERROR] Failed to update status: {update_error}")
        raise


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
    
    # Run the scraper synchronously - wait for completion
    print(f"[API] Starting scrape for run_id: {run_id}, zip_codes: {request.zip_codes}")
    
    try:
        # Run scrape in executor (non-blocking for async context, but we await it)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            _run_scrape_task,
            request.zip_codes,
            run_id,
            request.max_listings_per_zip,
            output_root,
            request.mode or "full",
        )
        
        # Scrape completed successfully
        from datetime import datetime
        completed_at = datetime.now().isoformat()
        print(f"[API] Scrape completed successfully for run_id: {run_id}")
        
        return ScrapeResponse(
            run_id=run_id,
            status="completed",
            message="Scraper completed successfully",
            completed_at=completed_at,
            error_message=None,
        )
    except Exception as e:
        # Scrape failed
        error_message = str(e)
        print(f"[API] Scrape failed for run_id {run_id}: {error_message}")
        import traceback
        traceback.print_exc()
        
        return ScrapeResponse(
            run_id=run_id,
            status="failed",
            message=f"Scraper failed: {error_message}",
            completed_at=None,
            error_message=error_message,
        )


@app.post("/api/cron/price-check")
async def cron_price_check(authorization: str = Header(default="")):
    """
    Cron endpoint: run full cron cycle (price check + favorites + comps backfill).
    Secured with Bearer token from CRON_SECRET env var.
    """
    if CRON_SECRET:
        token = authorization.replace("Bearer ", "").strip()
        if token != CRON_SECRET:
            raise HTTPException(status_code=401, detail="Invalid or missing CRON_SECRET")

    from zillow_scrapper.supabase_client import get_supabase_client
    from zillow_scrapper.price_check import run_cron_cycle

    client = get_supabase_client()
    if not client:
        raise HTTPException(status_code=500, detail="Supabase client not available")

    loop = asyncio.get_event_loop()
    summary = await loop.run_in_executor(None, run_cron_cycle, client)
    return {"status": "ok", "summary": summary}


# For Vercel serverless functions
# Export the app for Vercel's Python runtime
# Vercel will automatically detect and use the FastAPI app
