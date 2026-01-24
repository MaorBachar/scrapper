# Using CDP (Chrome DevTools Protocol) Connection

CDP connection allows you to connect Playwright to an existing Chrome browser instance. This is useful for:

1. **Better fingerprinting evasion** - Use a manually launched Chrome with your normal profile
2. **Pre-solved captchas** - Launch Chrome manually, solve captchas, then connect
3. **Stealth extensions** - Load anti-detection extensions before connecting
4. **Session persistence** - Use your existing Chrome profile with cookies/session data

## Setup

### Step 1: Launch Chrome with Remote Debugging

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-debug-profile" \
  --proxy-server="http://brd-customer-hl_75ee416a-zone-zillow_dc_proxy:foqv6aqe6u7k@brd.superproxy.io:33335"
```

**Linux:**
```bash
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.chrome-debug-profile" \
  --proxy-server="http://brd-customer-hl_75ee416a-zone-zillow_dc_proxy:foqv6aqe6u7k@brd.superproxy.io:33335"
```

**Windows:**
```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="%USERPROFILE%\.chrome-debug-profile" ^
  --proxy-server="http://brd-customer-hl_75ee416a-zone-zillow_dc_proxy:foqv6aqe6u7k@brd.superproxy.io:33335"
```

### Step 2: (Optional) Solve Captcha Manually

1. Navigate to `https://www.zillow.com` in the launched Chrome
2. Solve any captcha challenges
3. Keep the browser open

### Step 3: Run Scraper with CDP

```bash
cd /Users/maorb/projects/zillow-scrapper/scraper
source .venv/bin/activate

zillow-scrapper \
  --zips 44125 \
  --cdp-url "http://localhost:9222" \
  --max-listings-per-zip 5
```

## Benefits

- **Real browser fingerprint** - Uses your actual Chrome installation, not Playwright's bundled Chromium
- **Existing session** - Cookies, localStorage, and session data from your profile
- **Extensions** - Can use stealth/anti-detection browser extensions
- **Manual captcha solving** - Solve captchas once in the browser, then run scraper

## Notes

- The browser must stay open while the scraper runs
- CDP connection doesn't support proxy configuration (set proxy when launching Chrome)
- If using proxy, configure it when launching Chrome (as shown above)
- The scraper will use the first available page/tab, or create a new one if none exist

## Troubleshooting

**Connection refused:**
- Make sure Chrome is launched with `--remote-debugging-port=9222`
- Check that port 9222 is not blocked by firewall

**No pages available:**
- The scraper will create a new page if none exist
- You can manually open a new tab in Chrome before running

**Proxy not working:**
- Proxy must be set when launching Chrome, not via `--proxy-url` flag
- CDP connection inherits the browser's proxy settings
