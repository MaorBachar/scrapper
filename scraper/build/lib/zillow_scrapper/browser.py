from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from seleniumbase import SB


@dataclass
class BrowserSession:
    """SeleniumBase browser session wrapper."""
    sb: SB
    sb_context: object  # The context manager itself
    user_data_dir: Optional[Path] = None


def start_browser(
    *,
    headless: bool,
    user_data_dir: Optional[Path] = None,
    proxy: Optional[dict[str, str]] = None,
    cdp_url: Optional[str] = None,
) -> BrowserSession:
    """
    Start a SeleniumBase browser session.
    SeleniumBase has built-in stealth features and better bot detection evasion.
    """
    # Build proxy string if provided
    proxy_string = None
    if proxy:
        server = proxy.get("server", "")
        username = proxy.get("username")
        password = proxy.get("password")
        if username and password:
            # Format: username:password@host:port
            from urllib.parse import urlparse
            parsed = urlparse(server)
            proxy_string = f"{username}:{password}@{parsed.hostname}:{parsed.port}"
        else:
            from urllib.parse import urlparse
            parsed = urlparse(server)
            proxy_string = f"{parsed.hostname}:{parsed.port}"
    
    # SeleniumBase configuration
    sb_kwargs = {
        "headless": headless,
        "uc": True,  # Undetected Chrome mode (stealth)
        "incognito": False,
    }
    
    if proxy_string:
        sb_kwargs["proxy"] = proxy_string
    
    if user_data_dir:
        sb_kwargs["user_data_dir"] = str(user_data_dir)
    
    # Note: CDP URL not directly supported in SeleniumBase, but we can use undetected Chrome mode
    if cdp_url:
        sb_kwargs["uc"] = True
    
    # Use SB() context manager and enter it
    sb_context = SB(**sb_kwargs)
    sb = sb_context.__enter__()
    sb.open("about:blank")  # Initialize browser
    
    return BrowserSession(sb=sb, sb_context=sb_context, user_data_dir=user_data_dir)


def stop_browser(session: BrowserSession) -> None:
    """Close the SeleniumBase browser session."""
    try:
        session.sb_context.__exit__(None, None, None)
    except Exception:
        pass
