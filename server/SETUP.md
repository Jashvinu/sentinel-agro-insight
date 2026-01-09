# Local Server Setup Guide

## Quick Start

1. **Navigate to server directory:**
   ```bash
   cd server
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create `.env` file:**
   ```bash
   # Copy from your main .env or create new
   # Required: GOOGLE_CREDENTIALS_JSON
   # Optional: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for caching)
   ```

4. **Set environment variables:**
   ```bash
   # Google Earth Engine credentials (required)
   export GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
   
   # Or create .env file with:
   GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
   PORT=3000
   ```

5. **Start the server:**
   ```bash
   npm run dev    # Development with auto-reload
   # or
   npm start      # Production mode
   ```

   Or from project root:
   ```bash
   npm run server:dev
   ```

## Environment Variables

### Required
- `GOOGLE_CREDENTIALS_JSON`: Google Earth Engine service account credentials as a JSON string

### Optional
- `PORT`: Server port (default: 3000)
- `SUPABASE_URL`: Supabase project URL (for caching)
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for caching)

## Testing

Once the server is running, test it:

```bash
curl http://localhost:3000/health
```

You should see:
```json
{"status":"ok","message":"Advanced Monitoring Server is running"}
```

## Frontend Integration

The frontend automatically detects when running on `localhost` and uses the local server instead of Supabase Edge Functions. No additional configuration needed!

## Troubleshooting

### Error: "GOOGLE_CREDENTIALS_JSON environment variable not set"
- Make sure you've set the environment variable or created a `.env` file
- The JSON should be a single-line string (use `jq -c` to compress)

### Error: "Failed to initialize Earth Engine"
- Check that your service account has Earth Engine access enabled
- Verify the credentials JSON is valid

### Port already in use
- Change the `PORT` environment variable
- Or kill the process using port 3000: `lsof -ti:3000 | xargs kill`
