# WebSocket Debugging Guide

## How to Check if WebSocket is Working

### 1. Open Browser Console
Open your browser's Developer Tools (F12 or Cmd+Option+I on Mac) and go to the Console tab.

### 2. Expected Console Messages on Page Load

You should see these messages in order:

```
[WebSocket] Connected to server
[WebSocket] Authenticated successfully { userId: "..." }
[WebSocket] Re-subscribing to pending channels after authentication...
[WebSocket] Subscribing to channel: favorites
[WebSocket] Emitting subscribe for channel: favorites
[WebSocket] ✓ Successfully subscribed to channel: favorites (room: user_..._favorites)
```

### 3. When You Click Favorite Button

**On the CLIENT (Browser Console):**
```
[Mutation] Removing favorite: acad
[Mutation] Previous favorites count: 5
[Mutation] After removal - new count: 4
[Mutation] Remove success!
[Mutation] Ensured favorite removed, count: 4
[WebSocket] Received favorite_removed event: { parkCode: "acad" }
[Real-Time] Favorite removed: { parkCode: "acad" }
[Real-Time] Favorites after removal: 4
```

**On the SERVER (Terminal/Server Logs):**
```
[DELETE Favorite] Request received for parkCode: acad
[DELETE Favorite] User ID: 507f1f77bcf86cd799439011
[DELETE Favorite] Favorite found: true
[REMOVE Favorite] Notifying WebSocket for user: 507f1f77bcf86cd799439011 parkCode: acad
[WebSocket] Notifying favorite removed for user 507f1f77bcf86cd799439011: acad
[WebSocket] Sending favorite_removed to room user_507f1f77bcf86cd799439011_favorites { parkCode: 'acad' }
[WebSocket] Sockets in room user_507f1f77bcf86cd799439011_favorites: 1
```

### 4. Troubleshooting

#### Issue: "Sockets in room: 0"
**Problem**: User is not subscribed to the favorites channel.

**Check**:
1. Look for the subscription confirmation message
2. Make sure you see `[WebSocket] ✓ Successfully subscribed to channel: favorites`
3. If not, check for authentication errors

#### Issue: No "[WebSocket] Received favorite_removed event"
**Problem**: Client is not receiving WebSocket events.

**Possible causes**:
1. WebSocket not connected
2. Not subscribed to the channel
3. Server sending to wrong room

**Fix**: Refresh the page and check console messages from step 2

#### Issue: "Cannot subscribe - user not authenticated"
**Problem**: Subscription happening before authentication completes.

**Should be auto-fixed** by the pending subscription queue, but if you see this:
1. The subscription will be retried after authentication
2. You should see "Re-subscribing to pending channels after authentication..."

### 5. Check WebSocket Status

In browser console, type:
```javascript
// Get WebSocket service status
window.__websocketStatus = () => {
  const ws = window.websocketService;
  if (!ws) return 'Not available';
  return ws.getStatus();
};

__websocketStatus();
```

Expected output:
```javascript
{
  isConnected: true,
  isAuthenticated: true,
  reconnectAttempts: 0,
  socketId: "abc123...",
  pendingChannels: ["favorites"]
}
```

### 6. Manual Test

1. Open two browser tabs to the same park page
2. Open console in both tabs
3. In Tab 1: Click the favorite button
4. In Tab 2: Watch the console - you should see:
   ```
   [WebSocket] Received favorite_added event: { parkCode: "...", ... }
   [Real-Time] Favorite added: { parkCode: "...", ... }
   ```
5. The heart icon should update in Tab 2 within 1 second!

### 7. Common Issues & Solutions

#### Heart not updating immediately in same tab
- **Expected**: Optimistic update should make it instant
- **Check**: Mutation success callbacks in useFavorites
- **Fix**: Already implemented - should work now

#### Heart not updating in other tabs
- **Check**: Are WebSocket events being received? (see step 3)
- **Check**: Server logs - is it sending to the right room?
- **Check**: "Sockets in room" count - should be > 0

#### Page needs refresh to see changes
- **Problem**: WebSocket events not working at all
- **Check**: All console messages from step 2
- **Check**: Server WebSocket is running (you should see WebSocket server initialization in server logs)

### 8. Force Reconnect Test

In browser console:
```javascript
// This should trigger reconnection and resubscription
location.reload();
```

Watch for the full connection sequence from step 2.

---

## Quick Checklist

- [ ] Browser console shows "Connected to server"
- [ ] Browser console shows "Authenticated successfully"
- [ ] Browser console shows "Successfully subscribed to channel: favorites"
- [ ] Server logs show "User X subscribed to favorites"
- [ ] When clicking favorite, server logs show "Notifying WebSocket for user..."
- [ ] Server logs show "Sockets in room: 1" (or more)
- [ ] Browser console shows "Received favorite_removed event"
- [ ] Browser console shows "[Real-Time] Favorite removed"
- [ ] Heart icon updates without page refresh

If all checkboxes are ✓, WebSocket is working correctly!

