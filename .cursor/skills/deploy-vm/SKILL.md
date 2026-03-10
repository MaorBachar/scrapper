---
name: deploy-vm
description: Deploy the Next.js web app to the Oracle Cloud VM. Use when the user says "deploy", "push to production", "deploy to VM", or wants to ship the current version.
---

# Deploy to VM

Build locally and deploy the Next.js web app to the Oracle Cloud VM.

## Connection Details

Set these environment variables (e.g. in your shell profile or `.env`):

- `ZILLOW_SCRAPPER_SSH_KEY` — path to your SSH private key file
- `ZILLOW_SCRAPPER_HOST` — SSH user and host (e.g. `ubuntu@<ip>`)

Defaults used below:

- **App directory on VM**: `/home/ubuntu/app` (flat — the web app lives directly here, not in a `web/` subfolder)
- **PM2 process name**: `zillow-web`
- **Local source**: `/Users/maorb/projects/zillow-scrapper/web`

## Deployment Steps

### 1. Build locally

The VM has limited memory, so always build on the local machine:

```bash
cd /Users/maorb/projects/zillow-scrapper/web
npm run build
```

### 2. Package build artifacts

Tar the necessary files. Do **not** include `node_modules` — they are already installed on the VM.

```bash
cd /Users/maorb/projects/zillow-scrapper/web
tar czf /tmp/web-deploy.tar.gz .next src package.json next.config.ts tsconfig.json
```

### 3. Transfer to VM

```bash
scp -i "$ZILLOW_SCRAPPER_SSH_KEY" \
  /tmp/web-deploy.tar.gz \
  "$ZILLOW_SCRAPPER_HOST":/tmp/web-deploy.tar.gz
```

### 4. Extract and restart

```bash
ssh -i "$ZILLOW_SCRAPPER_SSH_KEY" "$ZILLOW_SCRAPPER_HOST" \
  "cd /home/ubuntu/app && tar xzf /tmp/web-deploy.tar.gz && pm2 restart zillow-web"
```

### 5. Verify

```bash
ssh -i "$ZILLOW_SCRAPPER_SSH_KEY" "$ZILLOW_SCRAPPER_HOST" \
  "pm2 status zillow-web"
```

Confirm the process is `online` and uptime is a few seconds (indicating a fresh restart).

## Notes

- If `package.json` dependencies changed, run `npm install` on the VM after extracting:
  ```bash
  ssh -i "$ZILLOW_SCRAPPER_SSH_KEY" "$ZILLOW_SCRAPPER_HOST" \
    "cd /home/ubuntu/app && npm install --production"
  ```
- The scraper runs as a separate PM2 process (`zillow-scraper`) and is not affected by web deploys.
- SQL migrations must be run manually via the Supabase dashboard SQL editor before deploying code that depends on schema changes.
