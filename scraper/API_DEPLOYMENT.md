# Python API Deployment Guide

This guide explains how to deploy the Python scraper as an HTTP API to Vercel.

## Prerequisites

1. Vercel account
2. Python scraper dependencies installed
3. Supabase credentials configured

## Deployment Steps

### 1. Install Dependencies

Make sure FastAPI and Mangum are installed:

```bash
cd scraper
pip install -e .
```

### 2. Configure Environment Variables

In your Vercel project settings, add these environment variables:

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

### 3. Deploy to Vercel

**Option A: Using Vercel CLI**

```bash
cd scraper
vercel
```

**Option B: Using GitHub Integration**

1. Push your code to GitHub
2. Import the project in Vercel
3. Set the root directory to `scraper/`
4. Vercel will automatically detect the Python runtime

### 4. Configure Vercel Settings

The `vercel.json` file is already configured, but make sure:

- **Root Directory**: `scraper/`
- **Build Command**: (leave empty or `pip install -e .`)
- **Output Directory**: (leave empty)
- **Install Command**: `pip install -e .`

### 5. Update Frontend Configuration

In your Next.js app's Vercel environment variables, set:

- `PYTHON_BACKEND_URL`: `https://your-python-backend.vercel.app`
- `PYTHON_BACKEND_PATH`: `/api/scrape` (default, can be omitted)

## API Endpoints

### POST `/api/scrape`

Start a scraping job.

**Request Body:**
```json
{
  "zip_codes": ["44125", "44101"],
  "max_listings_per_zip": 30,
  "run_id": "20260124_123456_789"  // Optional
}
```

**Response:**
```json
{
  "run_id": "20260124_123456_789",
  "status": "pending",
  "message": "Scraper started successfully"
}
```

### GET `/`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "message": "Zillow Scraper API"
}
```

## Important Notes

1. **Serverless Timeouts**: Vercel serverless functions have timeout limits:
   - Hobby plan: 10 seconds
   - Pro plan: 60 seconds
   - Enterprise: Up to 300 seconds

2. **Background Processing**: The scraper runs in a background task and will continue until the function times out. Data is saved incrementally to Supabase, so results persist even if the function times out.

3. **No File System**: In serverless environments, file writes are temporary. All data should be saved to Supabase.

4. **CORS**: The API allows CORS from all origins. In production, you may want to restrict this to your frontend domain.

## Troubleshooting

### 404 Error

- Check that `PYTHON_BACKEND_URL` points to the correct Vercel deployment
- Verify the endpoint path is `/api/scrape`
- Check Vercel deployment logs

### 500 Error

- Check Supabase environment variables are set correctly
- Review Vercel function logs for errors
- Verify Python dependencies are installed

### Timeout Errors

- The scraper may take longer than the function timeout
- Data is saved incrementally to Supabase, so partial results are available
- Consider using a job queue (Celery, etc.) for longer-running tasks
