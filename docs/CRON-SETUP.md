# GoCardless Daily Sync - Cron Setup Guide

## Problem

NestJS `@nestjs/schedule` cron jobs don't work reliably on Railway because:
- Railway containers can restart frequently
- In-process schedulers don't persist across restarts
- No guarantee a container will be running at the scheduled time

## Solution

We've implemented an HTTP endpoint that can be triggered by an external cron service (GitHub Actions, cron-job.org, etc.).

## Setup Instructions

### 1. Configure Environment Variable

Add the `CRON_SECRET` environment variable to your Railway project:

```bash
# Generate a strong random secret
railway variables set CRON_SECRET=$(openssl rand -base64 32)
```

Or manually in Railway dashboard:
1. Go to your project → Variables
2. Add new variable: `CRON_SECRET`
3. Value: A strong random string (use a password generator)

### 2. Endpoint Details

**URL**: `https://your-backend-url.railway.app/cron/daily-bank-sync`

**Method**: `POST`

**Headers**:
```
x-cron-secret: YOUR_CRON_SECRET_VALUE
```

**Response** (Success):
```json
{
  "message": "Daily bank sync triggered successfully",
  "status": "success"
}
```

**Response** (Error):
```json
{
  "message": "Daily bank sync failed: [error details]",
  "status": "error"
}
```

### 3. Setup External Cron Service

#### Option A: GitHub Actions (Recommended)

Create `.github/workflows/daily-sync.yml` in your **backend** repository:

```yaml
name: Daily Bank Sync

on:
  schedule:
    # Run at 9:00 AM UTC daily (adjust timezone as needed)
    - cron: '0 9 * * *'
  workflow_dispatch: # Allow manual trigger

jobs:
  trigger-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Daily Sync
        run: |
          response=$(curl -X POST \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            -H "Content-Type: application/json" \
            -w "\n%{http_code}" \
            https://your-backend-url.railway.app/cron/daily-bank-sync)

          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | head -n-1)

          echo "Response: $body"
          echo "Status: $http_code"

          if [ "$http_code" -ne 200 ]; then
            echo "Error: Daily sync failed with status $http_code"
            exit 1
          fi
```

**Setup**:
1. Go to your GitHub repository → Settings → Secrets and variables → Actions
2. Add secret: `CRON_SECRET` with the same value from Railway
3. Replace `your-backend-url.railway.app` with your actual Railway URL
4. Commit and push the workflow file

**Test manually**:
- Go to Actions tab → Daily Bank Sync → Run workflow

#### Option B: cron-job.org

1. Go to https://cron-job.org/en/
2. Create free account
3. Create new cron job:
   - **Title**: Coffee Budget Daily Sync
   - **URL**: `https://your-backend-url.railway.app/cron/daily-bank-sync`
   - **Schedule**: Daily at 9:00 AM
   - **Request Method**: POST
   - **Headers**: Add `x-cron-secret: YOUR_CRON_SECRET_VALUE`
   - **Notification**: Enable email on failure

#### Option C: EasyCron

1. Go to https://www.easycron.com/
2. Create free account
3. Create cron job:
   - **URL**: `https://your-backend-url.railway.app/cron/daily-bank-sync`
   - **Expression**: `0 9 * * *` (9 AM daily)
   - **HTTP Method**: POST
   - **Custom Headers**: `x-cron-secret: YOUR_CRON_SECRET_VALUE`

### 4. Verify Setup

#### Test the endpoint manually:

```bash
# Set your values
export BACKEND_URL="https://your-backend-url.railway.app"
export CRON_SECRET="your-cron-secret-value"

# Test the endpoint
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  "$BACKEND_URL/cron/daily-bank-sync"
```

Expected response:
```json
{
  "message": "Daily bank sync triggered successfully",
  "status": "success"
}
```

#### Check sync history after test:

```bash
railway run node scripts/check-sync-status.js
```

You should now see:
- Sync reports in the `sync_reports` table
- Recent transactions imported
- Timestamps showing when the sync ran

### 5. Monitor

**Check logs after scheduled run**:
```bash
railway logs --filter "Daily bank sync OR GocardlessSchedulerService"
```

**View sync reports in database**:
```bash
railway run node scripts/check-sync-status.js
```

## Security Notes

- ✅ **CRON_SECRET** must be kept secret - don't commit to Git
- ✅ Endpoint is separate from authenticated endpoints
- ✅ Only requests with valid secret can trigger sync
- ✅ All sync operations respect user isolation and security
- ⚠️ Use HTTPS only (Railway provides this automatically)

## Troubleshooting

### "Unauthorized - Invalid or missing cron secret"
- Verify `CRON_SECRET` is set in Railway environment
- Verify the secret in your request matches Railway value
- Check for extra spaces or newlines in the secret

### "Daily bank sync failed: [error]"
- Check Railway logs: `railway logs --lines 100`
- Verify GoCardless credentials are configured
- Check database connectivity
- Verify users have connected bank accounts

### No sync reports created
- Sync may have failed silently
- Check logs for errors during sync
- Verify SyncHistoryService is working correctly

### GitHub Actions not triggering
- Verify workflow file is in `.github/workflows/` directory
- Check Actions tab for any errors
- Repository must have Actions enabled
- Cron syntax must be valid

## Cost Considerations

- **GitHub Actions**: Free for public repos, 2000 minutes/month for private
- **cron-job.org**: Free tier allows multiple jobs
- **EasyCron**: Free tier limited to fewer jobs
- **Railway**: No extra cost - just API calls

## Next Steps

After setup:
1. ✅ Test endpoint manually to verify it works
2. ✅ Setup external cron service
3. ✅ Wait for first scheduled run
4. ✅ Verify sync reports are created
5. ✅ Monitor for a few days to ensure reliability
6. ✅ (Optional) Remove the in-process `@Cron` decorator if no longer needed

## Rollback

If you need to revert to in-process cron (not recommended for Railway):

1. The original cron job is still active in `GocardlessSchedulerService`
2. It will continue to run if NestJS scheduler is working
3. The new endpoint is additional, not a replacement

To disable the endpoint:
- Remove `CRON_SECRET` from Railway
- The endpoint will reject all requests
