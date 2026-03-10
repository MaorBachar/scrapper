from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console

from zillow_scrapper.run import run_scrape

app = typer.Typer(no_args_is_help=True)
console = Console()


@app.command()
def run(
    zips: str = typer.Option(
        ...,
        help="Comma-separated list of Ohio ZIP codes (e.g. 44101,44102).",
    ),
    output_dir: Path = typer.Option(
        Path("data/runs"),
        help="Output directory for run folders (relative to scraper/).",
    ),
    user_data_dir: Optional[Path] = typer.Option(
        None,
        help=(
            "Optional Playwright persistent profile dir (stores cookies). "
            "Use with --headful to solve Zillow captcha once."
        ),
    ),
    headful: bool = typer.Option(False, help="Run browser headful (non-headless)."),
    pause_on_captcha: bool = typer.Option(
        False,
        help="If Zillow shows a captcha/denied page, wait so you can solve it in headful mode.",
    ),
    run_id: Optional[str] = typer.Option(
        None,
        help="Resume an existing runId folder under --output-dir (will continue where it left off).",
    ),
    block_pause_min_seconds: int = typer.Option(
        60, help="When blocked and not pausing for manual solve, sleep a random time before skipping."
    ),
    block_pause_max_seconds: int = typer.Option(
        180, help="Max seconds for random block pause before skipping."
    ),
    max_listings_per_zip: Optional[int] = typer.Option(
        None, help="Optional cap for debugging."
    ),
    proxy_url: Optional[str] = typer.Option(
        None,
        help=(
            "Proxy URL (e.g., http://user:pass@proxy.example.com:8080). "
            "For Bright Data: http://customer-USERNAME:PASSWORD@zproxy.lum-superproxy.io:PORT"
        ),
    ),
    cdp_url: Optional[str] = typer.Option(
        None,
        help=(
            "Chrome DevTools Protocol URL to connect to existing browser "
            "(e.g., http://localhost:9222). "
            "Launch Chrome with: google-chrome --remote-debugging-port=9222 --user-data-dir=/path/to/profile"
        ),
    ),
    mode: str = typer.Option(
        "full",
        help="Scrape mode: full (listings+comps together) or listings_first (listings saved first, comps in background).",
    ),
):
    zip_list = [z.strip() for z in zips.split(",") if z.strip()]
    if not zip_list:
        raise typer.BadParameter("No ZIPs provided")

    proxy_config = None
    if proxy_url:
        from urllib.parse import urlparse
        parsed = urlparse(proxy_url)
        # Ensure port is parsed correctly (urlparse.port can be None)
        port = parsed.port
        if port is None:
            # Default ports based on scheme
            port = 8080 if parsed.scheme == "http" else 443
        proxy_config = {
            "server": f"{parsed.scheme}://{parsed.hostname}:{port}",
        }
        if parsed.username and parsed.password:
            proxy_config["username"] = parsed.username
            proxy_config["password"] = parsed.password
        
        # Log proxy config (without password) for debugging
        console.print(f"[cyan]Using proxy[/cyan]: {parsed.scheme}://{parsed.username}:***@{parsed.hostname}:{port}")

    if cdp_url:
        console.print(f"[cyan]Connecting via CDP[/cyan]: {cdp_url}")

    run_result = run_scrape(
        zip_codes=zip_list,
        output_root=output_dir,
        headless=not headful,
        user_data_dir=user_data_dir,
        pause_on_captcha=pause_on_captcha,
        run_id=run_id,
        block_pause_min_seconds=block_pause_min_seconds,
        block_pause_max_seconds=block_pause_max_seconds,
        max_listings_per_zip=max_listings_per_zip,
        proxy=proxy_config,
        cdp_url=cdp_url,
        mode=mode,
    )
    console.print(f"[green]Run complete[/green]: {run_result.run_id}")
    console.print(json.dumps(run_result.model_dump(), indent=2, default=str))


if __name__ == "__main__":
    app()

