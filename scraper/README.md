## Scraper

This folder contains the Python Playwright scraper and writes outputs into `scraper/data/runs/<runId>/`.

### Run (once dependencies are installed)

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install .
python -m playwright install chromium

# example run
zillow-scrapper --zips 44101,44102
```

### If Zillow blocks headless scraping (captcha / access denied)

```bash
zillow-scrapper --zips 44125 --headful --user-data-dir .pw-profile
```

