from __future__ import annotations

import time
from typing import Callable, Iterable

from playwright.sync_api import Page, Response


def _default_predicate(url_substrings: Iterable[str]) -> Callable[[Response], bool]:
    needles = tuple(url_substrings)
    return lambda r: any(n in r.url for n in needles)


def trigger_search_requests(
    page: Page,
    *,
    url_substrings: tuple[str, ...] = ("search/GetSearchPageState", "async-create-search-page-state"),
    total_timeout_ms: int = 15_000,
) -> dict[str, object]:
    """
    Perform deterministic, lightweight page interactions to trigger Zillow search network requests.

    Returns metrics:
      - triggered: bool
      - waited_for_search_response_ms: int
      - trigger_actions_performed: list[str]
    """
    actions: list[str] = []
    predicate = _default_predicate(url_substrings)

    start = time.time()

    def waited_ms() -> int:
        return int((time.time() - start) * 1000)

    # Quick attempt: sometimes the response comes in right after load.
    try:
        page.wait_for_response(predicate, timeout=1500)
        return {
            "triggered": True,
            "waited_for_search_response_ms": waited_ms(),
            "trigger_actions_performed": actions,
        }
    except Exception:
        pass

    # Action set 1: scroll nudges.
    for i in range(4):
        if waited_ms() > total_timeout_ms:
            break
        try:
            page.mouse.wheel(0, 1600)
            actions.append(f"mouse_wheel_{i}")
        except Exception:
            # Fallback to JS scroll.
            page.evaluate("() => window.scrollBy(0, 1600)")
            actions.append(f"window_scrollBy_{i}")

        try:
            page.wait_for_response(predicate, timeout=2000)
            return {
                "triggered": True,
                "waited_for_search_response_ms": waited_ms(),
                "trigger_actions_performed": actions,
            }
        except Exception:
            page.wait_for_timeout(500)

    # Action set 2: toggle map/list if present (often triggers a refresh).
    # We keep this very defensive; UI labels vary.
    for label in ("Map", "List"):
        if waited_ms() > total_timeout_ms:
            break
        loc = page.get_by_role("button", name=label)
        try:
            if loc.count() > 0:
                loc.first.click(timeout=1000)
                actions.append(f"click_button_{label.lower()}")
                try:
                    page.wait_for_response(predicate, timeout=2500)
                    return {
                        "triggered": True,
                        "waited_for_search_response_ms": waited_ms(),
                        "trigger_actions_performed": actions,
                    }
                except Exception:
                    page.wait_for_timeout(500)
        except Exception:
            continue

    return {
        "triggered": False,
        "waited_for_search_response_ms": waited_ms(),
        "trigger_actions_performed": actions,
    }

