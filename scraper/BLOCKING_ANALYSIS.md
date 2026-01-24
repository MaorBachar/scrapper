# Zillow Blocking Analysis

## When Blocking Occurs

**Blocking happens IMMEDIATELY on page load - BEFORE any scrolling or interactions.**

### Timeline of Events:

1. **`page.goto()`** (line 138 in `scrape_for_sale.py`)
   - Navigates to `https://www.zillow.com/homes/44125_rb/`
   - Zillow serves a PerimeterX captcha page **immediately**
   - Page title: "Access to this page has been denied"

2. **Page settles** (lines 162-166)
   - Waits 5 seconds (`settle_seconds`)
   - Waits for `networkidle` state (up to 10 seconds)

3. **Block detection** (line 168)
   - Checks `_is_px_captcha(page)` 
   - Detects: title contains "access to this page has been denied"
   - Detects: HTML contains "px-captcha"
   - **Result: `blocked = True`**

4. **Scrolling/interactions** (line 173)
   - `trigger_search_requests()` runs AFTER block is detected
   - Performs mouse wheel scrolls (4 times)
   - But it's too late - page is already blocked

5. **Final check** (line 101 in `run.py`)
   - `is_blocked(session.page)` confirms the block
   - Writes artifacts (screenshot, HTML, JSON)
   - Marks ZIP as "blocked" in state

## What Zillow Shows

From the HTML artifact (`blocked_zip_44125.html`):

- **Title**: "Access to this page has been denied"
- **Content**: PerimeterX captcha challenge
  - Message: "Press & Hold to confirm you are a human (and not a bot)."
  - Reference ID: `4bf8dccb-f3e2-11f0-8fd0-d8ffdca39fe3`
  - PerimeterX App ID: `PXHYx10rg3`

## Why Blocking Happens

PerimeterX detects automation **before** any page interactions:

1. **Browser fingerprinting**
   - Playwright's automation flags (`--disable-blink-features=AutomationControlled` helps but may not be enough)
   - WebDriver detection
   - Missing browser extensions/plugins

2. **Proxy IP reputation**
   - Bright Data IPs may be flagged as datacenter/residential proxies
   - IP rotation patterns

3. **Request patterns**
   - Headers (User-Agent, Accept-Language, etc.)
   - Timing patterns (too fast, too consistent)
   - Missing cookies/session data

4. **JavaScript execution**
   - PerimeterX runs client-side detection scripts
   - Checks for automation indicators in the browser environment

## Block Detection Points

The scraper checks for blocks in **two places**:

1. **`scrape_for_sale_zip()`** (line 168)
   - After page load and settle
   - Checks `_is_px_captcha()` which looks for:
     - Title: "access to this page has been denied"
     - HTML: "px-captcha" string

2. **`run.py`** (line 101)
   - After `scrape_for_sale_zip()` returns
   - Checks `is_blocked()` which looks for:
     - Title: "access to this page has been denied"
     - HTML: "px-captcha", "captcha" + "verify"/"human"

## Current Behavior

- **Block detected**: ✅ Correctly identified
- **Artifacts saved**: ✅ Screenshot, HTML, JSON saved
- **State persisted**: ✅ ZIP marked as "blocked" in `run_state.json`
- **Continues gracefully**: ✅ Pauses 60-180s then skips blocked ZIP

## The Problem

**Blocking happens BEFORE scrolling** - PerimeterX detects automation during the initial page load, not during interactions. The scrolling that happens afterward is irrelevant because the page is already blocked.

## Potential Solutions

1. **Headful mode with persistent profile** (`--headful --user-data-dir .pw-profile`)
   - Solve captcha manually once
   - Cookies/session persist for future runs
   - May reduce block frequency

2. **Better browser fingerprinting evasion**
   - More realistic user agent rotation
   - Browser extension simulation
   - Canvas/WebGL fingerprint randomization

3. **Slower, more human-like timing**
   - Random delays between requests
   - Simulate reading time on pages
   - Vary interaction patterns

4. **Residential proxies with better reputation**
   - Use Bright Data residential proxies (not datacenter)
   - Rotate IPs less frequently
   - Use IPs with good reputation scores

5. **Session management**
   - Maintain cookies across runs
   - Use persistent browser profiles
   - Build up "trust" over time
