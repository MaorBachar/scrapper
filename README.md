# Zillow Scraper

A web scraping tool for Zillow listings with Supabase integration and Next.js UI.

## Setup

### 1. Database Setup

Run the SQL schema in your Supabase dashboard:

```bash
# Copy the contents of web/supabase-schema.sql and run it in Supabase SQL Editor
```

### 2. Environment Variables

Create `web/.env.local` with your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://akxpakrvrhiorlclhdug.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

For the Python scraper, set these environment variables (or pass them when running):

```bash
export SUPABASE_URL=https://akxpakrvrhiorlclhdug.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Install Dependencies

**Web (Next.js):**
```bash
cd web
npm install
```

**Scraper (Python):**
```bash
cd scraper
pip install -e .
```

### 4. Run the Application

**Start the web UI:**
```bash
cd web
npm run dev
```

Visit http://localhost:3000

**Run scraper manually (CLI):**
```bash
cd scraper
zillow-scrapper --zips 44125 --max-listings-per-zip 30
```

## Features

- **Web UI**: Trigger scrapes via API, view runs, and see results
- **Supabase Integration**: All data stored in Supabase (with JSON backup)
- **Async Processing**: Scrapes run in the background
- **Status Tracking**: Real-time status updates for running scrapes
- **Architectural Style Matching**: Comps filtered by architectural style

## Architecture

- **Frontend**: Next.js with server components
- **Backend**: Next.js API routes
- **Database**: Supabase (PostgreSQL)
- **Scraper**: Python with HomeHarvest
# scrapper
# scrapper
