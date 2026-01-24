from __future__ import annotations

import re
from typing import Any, Optional


_ZPID_RE = re.compile(r"/(\d+)_zpid/?")


def try_extract_zpid_from_url(url: str) -> Optional[str]:
    m = _ZPID_RE.search(url)
    return m.group(1) if m else None


def deep_get(obj: Any, path: list[str]) -> Any:
    cur = obj
    for key in path:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(key)
        else:
            return None
    return cur


def coerce_int(value: Any) -> Optional[int]:
    try:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            v = value.strip()
            # Common Zillow formats: "$249,900", "249,900", "+$1,234", etc.
            for ch in ["$", ",", "+"]:
                v = v.replace(ch, "")
            v = v.strip()
            if v == "":
                return None
            value = v
        return int(float(value))
    except Exception:
        return None


def coerce_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def extract_architectural_style(text: Optional[str]) -> Optional[str]:
    """
    Extract architectural style from property description text.
    Returns the first matching architectural style found, or None.
    """
    if not text:
        return None
    
    text_lower = text.lower()
    
    # Common architectural styles to look for (ordered by specificity)
    # Multi-word styles first to avoid partial matches
    style_patterns = [
        ("split level", "Split Level"),
        ("cape cod", "Cape Cod"),
        ("cape cod style", "Cape Cod"),
        ("colonial", "Colonial"),
        ("colonial style", "Colonial"),
        ("contemporary", "Contemporary"),
        ("victorian", "Victorian"),
        ("tudor", "Tudor"),
        ("ranch", "Ranch"),
        ("ranch style", "Ranch"),
        ("bungalow", "Bungalow"),
        ("craftsman", "Craftsman"),
        ("modern", "Modern"),
        ("traditional", "Traditional"),
        ("mediterranean", "Mediterranean"),
        ("spanish", "Spanish"),
        ("french", "French"),
        ("federal", "Federal"),
        ("georgian", "Georgian"),
        ("greek revival", "Greek Revival"),
        ("prairie", "Prairie"),
        ("art deco", "Art Deco"),
        ("mid-century modern", "Mid-Century Modern"),
        ("a-frame", "A-Frame"),
        ("log", "Log"),
        ("cabin", "Cabin"),
        ("townhouse", "Townhouse"),
        ("condo", "Condo"),
        ("loft", "Loft"),
    ]
    
    for pattern, style_name in style_patterns:
        if pattern in text_lower:
            return style_name
    
    return None

