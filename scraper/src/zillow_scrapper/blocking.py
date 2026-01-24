from __future__ import annotations

import json
import random
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from seleniumbase import SB


def is_blocked(sb: SB) -> bool:
    """
    Detect if we're blocked by PerimeterX captcha and solve it automatically.
    Returns True if captcha was detected (and solved), False otherwise.
    """
    try:
        title = sb.get_title().lower()
        if "access to this page has been denied" in title:
            # CAPTCHA detected - solving automatically
            sb.solve_captcha()
            return True
    except Exception:
        pass
    try:
        html = sb.get_page_source().lower()
        # Explicit challenge markers
        if "px-captcha" in html:
            # CAPTCHA detected - solving automatically
            sb.solve_captcha()
            return True
        if "captcha" in html and ("verify" in html or "human" in html):
            # CAPTCHA detected - solving automatically
            sb.solve_captcha()
            return True
    except Exception:
        pass
    return False


def write_block_artifacts(
    sb: SB,
    *,
    out_dir: Path,
    prefix: str,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    """
    Write artifacts when captcha is detected.
    
    ⚠️ CAPTCHA DETECTED - STOPPING SCRAPER ⚠️
    This function saves screenshots, HTML, and metadata when a captcha block is detected.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).isoformat()
    meta = {
        "timestamp": ts,
        "prefix": prefix,
        "url": None,
        "title": None,
        "extra": extra or {},
        "note": "⚠️ CAPTCHA DETECTED - STOPPING SCRAPER ⚠️",
    }
    try:
        meta["url"] = sb.get_current_url()
        meta["title"] = sb.get_title()
    except Exception:
        pass

    # Best-effort; ignore failures.
    try:
        sb.save_screenshot(str(out_dir / f"{prefix}.png"))
    except Exception:
        pass
    try:
        (out_dir / f"{prefix}.html").write_text(sb.get_page_source(), encoding="utf-8")
    except Exception:
        pass
    try:
        (out_dir / f"{prefix}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    except Exception:
        pass


def random_pause_seconds(min_seconds: int, max_seconds: int) -> int:
    return int(random.randint(min_seconds, max_seconds))


def pause_then_continue(*, min_seconds: int, max_seconds: int) -> int:
    secs = random_pause_seconds(min_seconds, max_seconds)
    time.sleep(secs)
    return secs

