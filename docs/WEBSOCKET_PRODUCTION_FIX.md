# WebSocket Production Fix

## Problem

WebSocket connections were failing in production with the error:
```
WebSocket connection to 'wss://www.nationalparksexplorerusa.com/socket.io/?EIO=4&transport=websocket' failed
```

## Root Cause

The frontend is deployed on **Vercel** (static hosting), which **does not support WebSocket connections**. The backend with the Socket.IO server is deployed on **Render** at `https://trailverse.onrender.com`.

The WebSocket client was trying to connect to the Vercel frontend URL instead of directly to the Render backend where the Socket.IO server is actually running.

## Solution

### 1. Environment Variable Configuration

**Development (.env):**
```env
VITE_WS_URL=http://localhost:5001
```

**Production (.env.production or Vercel Environment Variables):**
```env
VITE_WS_URL=https://trailverse.onrender.com
```

### 2. Code Changes

#### Client-Side (`websocketService.js`)
- Added `VITE_WS_URL` environment variable support
- Improved fallback logic
- Added `withCredentials: true` for cross-origin authentication
- Added detailed logging for debugging

#### Server-Side (`app.js`)
- Enhanced Socket.IO CORS configuration with origin validation
- Added support for multiple allowed origins
- Increased ping timeout/interval for production reliability
- Added better error logging

### 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Production Flow                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Browser                                                 │
│    │                                                     │
│    ├─── HTTP/HTTPS Requests ──────────────────┐         │
│    │    (API calls)                            │         │
│    │                                           ▼         │
│    │                                    Vercel Frontend  │
│    │                                    (Static Host)    │
│    │                                           │         │
│    │                                           │         │
│    │    /api/* proxied via vercel.json         │         │
│    │                ────────────────────────────┘         │
│    │                                           │         │
│    └─── WebSocket Connection ─────────────────┼─────┐   │
│         (Direct to backend)                   │     │   │
│                                               │     │   │
│                                               ▼     ▼   │
│                                          Render Backend  │
│                                     (Express + Socket.IO)│
│                                    trailverse.onrender.com│
└─────────────────────────────────────────────────────────┘
```

### 4. Key Points

1. **HTTP API Requests**: Proxied through Vercel using `vercel.json` rewrites
2. **WebSocket Connections**: Go directly to Render backend (bypassing Vercel)
3. **CORS**: Backend allows connections from both localhost and production domain
4. **Authentication**: WebSocket uses JWT token stored in localStorage

## Deployment Instructions

### Step 1: Update Vercel Environment Variables

Go to your Vercel project settings and add:

```
VITE_WS_URL=https://trailverse.onrender.com
```

**Important**: Make sure to add this to **all deployment environments** (Production, Preview, Development).

### Step 2: Redeploy Frontend

After adding the environment variable:

```bash
# Trigger a new deployment
cd client
git commit --allow-empty -m "Update WebSocket configuration"
git push origin master
```

Or use Vercel CLI:
```bash
vercel --prod
```

### Step 3: Verify Backend is Running

Ensure your Render backend is running and accessible:

```bash
curl https://trailverse.onrender.com/health
```

Should return a health check response.

### Step 4: Test WebSocket Connection

Open browser console on production site and look for:

```
[WebSocket] Connecting to: https://trailverse.onrender.com
[WebSocket] ✅ Connected to server, socket.id: <socket-id>
[WebSocket] 🔐 Sending authentication...
[WebSocket] Authenticated successfully
```

## Troubleshooting

### Issue: Still getting connection errors

**Check:**
1. Verify `VITE_WS_URL` is set in Vercel
2. Confirm Render backend is running
3. Check Render logs for CORS errors
4. Ensure JWT token is valid and not expired

**Test in console:**
```javascript
console.log(import.meta.env.VITE_WS_URL)
// Should output: https://trailverse.onrender.com
```

### Issue: CORS errors

**Backend logs might show:**
```
[WebSocket] Rejected connection from origin: <origin>
```

**Solution:**
- Add the origin to `allowedOrigins` array in `server/src/app.js`
- Make sure `CLIENT_URL` environment variable is set on Render

### Issue: Authentication fails

**Check:**
1. Token is being sent correctly
2. Backend token validation is working
3. Token hasn't expired

**Debug:**
```javascript
// In browser console
console.log(localStorage.getItem('token'))
```

### Issue: Render backend is sleeping (cold start)

Render's free tier puts services to sleep after inactivity. First connection may take 30-60 seconds.

**Solution:**
- Wait for backend to wake up
- Consider upgrading to paid Render plan for always-on service
- Implement retry logic (already in place with `reconnectionAttempts: 5`)

## Environment Variables Reference

### Client (Vercel)
| Variable | Development | Production |
|----------|-------------|------------|
| `VITE_WS_URL` | `http://localhost:5001` | `https://trailverse.onrender.com` |
| `VITE_API_URL` | `http://localhost:5001/api` | `/api` (proxied) |

### Server (Render)
| Variable | Value |
|----------|-------|
| `CLIENT_URL` | `https://www.nationalparksexplorerusa.com` |
| `NODE_ENV` | `production` |
| `PORT` | `5001` (or Render default) |

## Testing Checklist

After deployment, verify:

- [ ] Frontend loads without errors
- [ ] WebSocket connects successfully
- [ ] Real-time updates work (favorites, trips, reviews)
- [ ] No CORS errors in console
- [ ] Authentication works
- [ ] Reconnection works after network interruption

## Additional Notes

### Why not use Vercel rewrites for WebSocket?

Vercel rewrites only work for HTTP/HTTPS requests, not WebSocket connections. WebSocket requires a persistent connection that Vercel's serverless architecture doesn't support.

### Alternative Solutions

If you need WebSocket support on the same domain:

1. **Move backend to Vercel Serverless Functions** (requires Socket.IO adapter changes)
2. **Use a different hosting provider** that supports both static hosting and WebSocket
3. **Use Vercel + Pusher/Ably** (third-party WebSocket service)
4. **Current solution** (Vercel frontend + Render backend) ✅ Recommended for your setup

## Related Files

- `client/src/services/websocketService.js` - WebSocket client implementation
- `server/src/app.js` - Socket.IO server setup
- `server/src/services/websocketService.js` - WebSocket event handlers
- `client/vercel.json` - Vercel configuration with API rewrites
- `client/env.production.example` - Production environment template

## Support

If issues persist:

1. Check Render backend logs
2. Check Vercel deployment logs
3. Verify all environment variables are set correctly
4. Test WebSocket connection directly: `https://trailverse.onrender.com/socket.io/`

