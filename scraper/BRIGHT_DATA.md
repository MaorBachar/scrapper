# Using Bright Data Proxies

This scraper supports Bright Data (formerly Luminati) residential/datacenter proxies to help reduce captcha frequency by rotating IP addresses.

## Setup

1. **Get Bright Data credentials** from your Bright Data dashboard:
   - Username: Your Bright Data customer username (format varies by zone)
   - Password: Your Bright Data password
   - Proxy endpoint: `brd.superproxy.io` (newer format) or `zproxy.lum-superproxy.io` (legacy)
   - Port: Varies by zone (e.g., `33335` for datacenter collector zones)

2. **Run with proxy**:

```bash
cd /Users/maorb/projects/zillow-scrapper/scraper
source .venv/bin/activate

# Example: Using Bright Data Zillow datacenter proxy zone
zillow-scrapper \
  --zips 44125 \
  --proxy-url "http://brd-customer-hl_75ee416a-zone-zillow_dc_proxy:foqv6aqe6u7k@brd.superproxy.io:33335" \
  --max-listings-per-zip 5

# Example: Legacy format (if using older Bright Data zones)
zillow-scrapper \
  --zips 44125 \
  --proxy-url "http://customer-USERNAME:PASSWORD@zproxy.lum-superproxy.io:22225" \
  --max-listings-per-zip 5
```

## Important Notes

- **Compliance**: Ensure your use case complies with Zillow's Terms of Service. Bright Data proxies do not bypass legal restrictions.
- **Captchas may still appear**: Proxies help reduce frequency but don't eliminate captchas entirely. The scraper's pause/skip behavior still applies.
- **Persistent profiles**: If using `--user-data-dir` (persistent cookies), proxy rotation may reduce session persistence benefits.
- **Cost**: Bright Data charges per GB/request. Monitor usage in your dashboard.

## Alternative: Environment Variable

You can also set the proxy URL via environment variable:

```bash
export ZILLOW_PROXY_URL="http://customer-USERNAME:PASSWORD@zproxy.lum-superproxy.io:22225"
zillow-scrapper --zips 44125
```

(Note: CLI flag takes precedence over env var if both are set.)
