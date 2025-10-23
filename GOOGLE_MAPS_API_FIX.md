# Google Maps API Production Fix

## 🚨 Problem
Google Maps categories (restaurants, lodging, gas stations) are failing in production with 400 errors:
```
trailverse.onrender.com/api/gmaps/nearby?lat=37.8651011&lng=-119.5383294&type=restaurant&radius=50000:1  Failed to load resource: the server responded with a status of 400
```

## 🔍 Root Cause Analysis

The issue is likely one of these:

### 1. **Missing Server-Side API Key**
- `GMAPS_SERVER_KEY` environment variable not set in production
- Using client-side key instead of server-side key

### 2. **API Key Configuration Issues**
- API key not configured for server-side usage
- Places API not enabled for the key
- Billing not enabled on Google Cloud project

### 3. **API Restrictions**
- Key has domain/IP restrictions that don't allow server-side usage
- Key restricted to specific APIs (not including Places API)

## 🛠️ Solution Steps

### Step 1: Check Current Configuration

Run the diagnostic script to identify the issue:

```bash
# In production (Render/Railway/Vercel)
node server/scripts/diagnose-gmaps.js

# Or check the debug endpoint
curl https://trailverse.onrender.com/api/gmaps/debug
```

### Step 2: Fix API Key Configuration

#### Option A: Create New Server-Side API Key

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Select your project (or create new one)

2. **Enable Required APIs**
   - Go to "APIs & Services" > "Library"
   - Search for and enable:
     - **Places API**
     - **Geocoding API** (if needed)
     - **Maps JavaScript API** (for client-side)

3. **Create Server-Side API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Click "Restrict Key"
   - Under "API restrictions":
     - Select "Restrict key"
     - Choose "Places API" and "Geocoding API"
   - Under "Application restrictions":
     - Select "None" (for server-side usage)
   - Save the key

4. **Enable Billing**
   - Go to "Billing" in Google Cloud Console
   - Link a payment method
   - **Important**: Google Maps API requires billing to be enabled

#### Option B: Fix Existing API Key

1. **Check API Restrictions**
   - Go to Google Cloud Console > APIs & Services > Credentials
   - Click on your existing API key
   - Under "Application restrictions":
     - Change from "HTTP referrers" to "None" (for server-side)
   - Under "API restrictions":
     - Ensure "Places API" is enabled

2. **Enable Billing**
   - Go to "Billing" in Google Cloud Console
   - Ensure billing is enabled and payment method is linked

### Step 3: Update Environment Variables

#### For Render.com:
1. Go to your Render dashboard
2. Select your service
3. Go to "Environment" tab
4. Add/update:
   ```
   GMAPS_SERVER_KEY=your_server_side_api_key_here
   ```

#### For Railway:
1. Go to Railway dashboard
2. Select your project
3. Go to "Variables" tab
4. Add/update:
   ```
   GMAPS_SERVER_KEY=your_server_side_api_key_here
   ```

#### For Vercel:
1. Go to Vercel dashboard
2. Select your project
3. Go to "Settings" > "Environment Variables"
4. Add/update:
   ```
   GMAPS_SERVER_KEY=your_server_side_api_key_here
   ```

### Step 4: Test the Fix

1. **Deploy the changes**
2. **Test the debug endpoint**:
   ```bash
   curl https://your-domain.com/api/gmaps/debug
   ```
   Should return:
   ```json
   {
     "hasKey": true,
     "keyLength": 39,
     "keyPrefix": "AIzaSyAmSU...",
     "environment": "production"
   }
   ```

3. **Test a real API call**:
   ```bash
   curl "https://your-domain.com/api/gmaps/nearby?lat=40.7128&lng=-74.0060&type=restaurant&radius=1000"
   ```

## 🔧 Enhanced Error Handling

I've updated the server code to provide better error messages:

### New Debug Endpoint
- `GET /api/gmaps/debug` - Shows API key status
- `GET /api/gmaps/debug-places` - Tests Google Places API directly

### Enhanced Error Responses
The `/api/gmaps/nearby` endpoint now returns detailed error information:

```json
{
  "error": "Google Places API access denied. Check API key and billing.",
  "status": "REQUEST_DENIED",
  "message": "The provided API key is not valid.",
  "debug": {
    "hasKey": true,
    "keyLength": 39,
    "url": "https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=40.7128,-74.0060&radius=1000&type=restaurant&key=HIDDEN_KEY"
  }
}
```

## 🧪 Testing Checklist

- [ ] API key is set in production environment
- [ ] Places API is enabled in Google Cloud Console
- [ ] Billing is enabled on Google Cloud project
- [ ] API key has no application restrictions (for server-side usage)
- [ ] API key has Places API enabled in restrictions
- [ ] Debug endpoint returns `hasKey: true`
- [ ] Test API call returns restaurant data
- [ ] Client-side maps still work (different API key)

## 🚀 Deployment

After fixing the environment variables:

1. **Redeploy your application**
2. **Check the logs** for any remaining errors
3. **Test the maps functionality** in production
4. **Monitor API usage** in Google Cloud Console

## 📊 Monitoring

Set up monitoring for:
- API quota usage
- Error rates
- Response times
- Cost tracking

## 🔒 Security Best Practices

1. **Use separate API keys** for client-side and server-side
2. **Restrict API keys** to specific APIs
3. **Monitor usage** regularly
4. **Set up billing alerts** to avoid unexpected charges
5. **Rotate keys** periodically

## 🆘 Troubleshooting

If issues persist:

1. **Check Google Cloud Console** for API usage and errors
2. **Verify billing** is enabled and payment method is valid
3. **Review API key restrictions** in Google Cloud Console
4. **Check server logs** for detailed error messages
5. **Test with the diagnostic script** provided

## 📞 Support

- Google Maps API Documentation: https://developers.google.com/maps/documentation/places/web-service
- Google Cloud Console: https://console.cloud.google.com/
- Google Maps API Support: https://developers.google.com/maps/support
