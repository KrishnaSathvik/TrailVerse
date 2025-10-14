# 🚀 WebSocket Quick Reference Card

## 🔧 Environment Variables

### Frontend (Vercel)
```bash
VITE_WS_URL=https://trailverse.onrender.com
VITE_API_URL=/api
```

### Backend (Render)
```bash
CLIENT_URL=https://www.nationalparksexplorerusa.com
NODE_ENV=production
PORT=5001
```

## 📍 URLs

| Type | Development | Production |
|------|-------------|------------|
| **Frontend** | http://localhost:3000 | https://www.nationalparksexplorerusa.com |
| **Backend** | http://localhost:5001 | https://trailverse.onrender.com |
| **WebSocket** | ws://localhost:5001 | wss://trailverse.onrender.com |
| **API** | http://localhost:5001/api | /api (proxied to Render) |

## ⚡ Quick Commands

### Verify Configuration
```bash
cd client
node verify-websocket-config.js
```

### Check Backend Health
```bash
curl https://trailverse.onrender.com/health
```

### Deploy Frontend
```bash
git add .
git commit -m "Update WebSocket config"
git push origin master
```

### Local Development
```bash
# Terminal 1 - Backend
cd server
npm start

# Terminal 2 - Frontend  
cd client
npm run dev
```

## 🔍 Debug Commands (Browser Console)

### Check Environment
```javascript
console.log('WS URL:', import.meta.env.VITE_WS_URL)
console.log('API URL:', import.meta.env.VITE_API_URL)
console.log('Mode:', import.meta.env.MODE)
```

### Check WebSocket Status
```javascript
window.websocketService.getStatus()
```

### Manual Connect (if needed)
```javascript
const token = localStorage.getItem('token')
window.websocketService.connect(token)
```

## ✅ Success Indicators

### Console Logs (Good ✅)
```
[WebSocket] Connecting to: https://trailverse.onrender.com
[WebSocket] ✅ Connected to server
[WebSocket] 🔐 Sending authentication...
[WebSocket] Authenticated successfully
[WebSocket] 🎉 ✓ SUBSCRIPTION CONFIRMED
```

### Console Errors (Bad ❌)
```
WebSocket connection to 'wss://...' failed
[WebSocket] Connection error
[WebSocket] Authentication error
Not allowed by CORS
```

## 🔴 Common Issues & Quick Fixes

| Issue | Quick Fix |
|-------|-----------|
| Connection fails | Check `VITE_WS_URL` is set in Vercel |
| CORS error | Check `CLIENT_URL` is set in Render |
| Auth error | Log out and log back in |
| Slow connect | Render cold start (wait 60s) |
| Undefined env | Redeploy after setting env vars |

## 📱 Testing Checklist

- [ ] WebSocket connects (check console)
- [ ] Add favorite (updates instantly)
- [ ] Remove favorite (updates instantly)
- [ ] Create trip (real-time update)
- [ ] Add review (real-time update)
- [ ] Open in two tabs (both update)
- [ ] Test on mobile
- [ ] Test after page refresh

## 🆘 Emergency Commands

### Force Reconnect
```javascript
// In browser console
window.websocketService.disconnect()
window.websocketService.connect(localStorage.getItem('token'))
```

### Clear All and Restart
```javascript
// In browser console
localStorage.clear()
window.location.reload()
// Then log in again
```

### Check Token
```javascript
// In browser console
console.log(localStorage.getItem('token'))
// Should show JWT token, not null
```

## 📊 Connection States

```
🔴 Disconnected → Not connected to server
🟡 Connecting   → Attempting to connect
🟢 Connected    → Connected but not authenticated
🟢 Authenticated → Fully connected and ready
```

## 🔗 Quick Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Render Dashboard**: https://dashboard.render.com/
- **Production Site**: https://www.nationalparksexplorerusa.com
- **Backend API**: https://trailverse.onrender.com/api
- **Backend Health**: https://trailverse.onrender.com/health

## 📞 Support Files

```
📄 WEBSOCKET_FIX_SUMMARY.md           ← Start here
📄 URGENT_WEBSOCKET_FIX_ACTION_ITEMS.md ← Quick deployment guide
📄 WEBSOCKET_PRODUCTION_FIX.md         ← Detailed technical docs
📄 WEBSOCKET_ARCHITECTURE_DIAGRAM.md   ← Visual architecture
🔧 client/verify-websocket-config.js   ← Config verification tool
```

## 💡 Pro Tips

1. **Always check environment variables first** - 90% of issues are env vars
2. **Clear browser cache** after redeployment
3. **Check Render logs** for server-side issues
4. **Use browser console** for client-side debugging
5. **Wait for cold starts** on Render free tier (30-60s)

## 🎯 One-Line Checks

```bash
# Check if WebSocket env var is set in production
curl -s https://www.nationalparksexplorerusa.com | grep VITE_WS_URL

# Check if backend is responding
curl -I https://trailverse.onrender.com/health

# Check if Render is sleeping
time curl https://trailverse.onrender.com/health
# If >10s, it's waking from sleep
```

## 🔄 Update Workflow

1. Make code changes
2. Commit to git
3. Push to GitHub
4. Vercel auto-deploys (2-3 min)
5. Test production
6. Monitor logs

## 📌 Remember

- **Vercel** = Frontend only (no WebSocket support)
- **Render** = Backend with WebSocket support
- **WebSocket** = Direct to Render (bypass Vercel)
- **API Calls** = Through Vercel → Render (proxied)

---

**Keep this handy for quick troubleshooting!**

Print-friendly format • Last updated: Oct 14, 2025

