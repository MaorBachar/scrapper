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


def extract_architectural_style(
    text: Optional[str] = None,
    direct_field: Optional[str] = None
) -> Optional[str]:
    """
    Extract architectural style from property data.
    
    Args:
        text: Property description text to search for styles
        direct_field: Direct architectural style field value from API (takes precedence)
    
    Returns:
        The architectural style found, or None.
    """
    # First, check if we have a direct field value (most reliable)
    if direct_field:
        direct_lower = direct_field.lower().strip()
        # Normalize common variations
        if direct_lower:
            # Capitalize first letter of each word
            return direct_field.strip().title()
    
    # If no direct field, extract from text
    if not text:
        return None
    
    text_lower = text.lower()
    
    # Common architectural styles to look for (ordered by specificity)
    # Multi-word styles first to avoid partial matches
    # More specific patterns should come before less specific ones
    style_patterns = [
        # Multi-word styles (most specific first)
        ("mid-century modern", "Mid-Century Modern"),
        ("cape cod style", "Cape Cod"),
        ("cape cod", "Cape Cod"),
        ("split level", "Split Level"),
        ("colonial style", "Colonial"),
        ("ranch style", "Ranch"),
        ("greek revival", "Greek Revival"),
        ("art deco", "Art Deco"),
        ("a-frame", "A-Frame"),
        # Single-word styles (ordered by specificity/commonality)
        # Put "bungalow" before "traditional" since bungalow is more specific
        ("bungalow", "Bungalow"),
        ("craftsman", "Craftsman"),
        ("colonial", "Colonial"),
        ("contemporary", "Contemporary"),
        ("victorian", "Victorian"),
        ("tudor", "Tudor"),
        ("ranch", "Ranch"),
        ("modern", "Modern"),
        ("traditional", "Traditional"),  # More generic, check after specific styles
        ("mediterranean", "Mediterranean"),
        ("spanish", "Spanish"),
        ("french", "French"),
        ("federal", "Federal"),
        ("georgian", "Georgian"),
        ("prairie", "Prairie"),
        ("log", "Log"),
        ("cabin", "Cabin"),
        ("townhouse", "Townhouse"),
        ("condo", "Condo"),
        ("loft", "Loft"),
    ]
    
    # Find all matches with their positions and pattern indices
    matches = []
    for pattern_idx, (pattern, style_name) in enumerate(style_patterns):
        # Use word boundaries for single-word patterns to avoid partial matches
        # For multi-word patterns, use simple substring search
        if " " in pattern or "-" in pattern:
            # Multi-word pattern: search as-is
            pos = text_lower.find(pattern)
            if pos != -1:
                matches.append((pattern_idx, pos, style_name, pattern))
        else:
            # Single-word pattern: use word boundaries
            # Match whole word only (not part of another word)
            # Allow hyphen after the word (e.g., "bungalow-style") but not before (e.g., "non-traditional")
            # Use negative lookbehind to avoid matches after "non-" or similar prefixes
            pattern_re = re.compile(
                r'(?<!non-)(?<!un-)(?<!anti-)\b' + re.escape(pattern) + r'(?![a-z])',  # \b ensures word boundary, (?![a-z]) allows hyphen or end
                re.IGNORECASE
            )
            match = pattern_re.search(text_lower)
            if match:
                matches.append((pattern_idx, match.start(), style_name, pattern))
    
    if not matches:
        return None
    
    # If multiple matches found, prioritize:
    # 1. Pattern specificity (earlier in pattern list = more specific, e.g., "bungalow" before "traditional")
    # 2. Earlier position in text (if same specificity)
    # This ensures "bungalow" wins over "traditional" even if "traditional" appears first in text
    matches.sort(key=lambda x: (x[0], x[1]))
    
    return matches[0][2]

