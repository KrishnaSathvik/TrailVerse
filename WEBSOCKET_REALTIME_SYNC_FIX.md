# WebSocket Real-Time Sync Fix for Favorites, Blogs, and Events

## Issues Identified

### 1. **Park Favorites - Subscription Timing Issue**
- **Problem**: WebSocket subscription to the favorites channel was happening BEFORE authentication completed
- **Impact**: The server silently ignored subscription requests from unauthenticated sockets
- **Symptom**: Red heart icon didn't update immediately when favoriting a park; only showed after page refresh

### 2. **Blog Favorites - Missing WebSocket Notifications**
- **Problem**: Blog favorite/unfavorite actions didn't send WebSocket notifications
- **Impact**: No real-time updates when favoriting blogs
- **Symptom**: Blog favorite button didn't update in real-time

### 3. **Event Registration - Missing WebSocket Notifications**
- **Problem**: Event registration/unregistration didn't send WebSocket notifications  
- **Impact**: No real-time updates when registering for events
- **Symptom**: Event registration status didn't update in real-time

### 4. **Optimistic Updates - Premature Cache Invalidation**
- **Problem**: Favorites mutations invalidated cache too quickly (500ms), potentially overwriting optimistic updates
- **Impact**: Could cause UI to flicker or revert favorite status temporarily
- **Symptom**: Inconsistent UI updates

## Fixes Implemented

### Client-Side Fixes

#### 1. WebSocket Service (`client/src/services/websocketService.js`)
**Changes:**
- Added `isAuthenticated` flag to track authentication state
- Added `pendingChannels` Set to track channels that need subscription
- Modified subscription logic to queue subscriptions until authentication completes
- Added `resubscribeAllChannels()` method to subscribe to pending channels after authentication
- Added support for blog and event WebSocket events:
  - `blog_favorited` / `blog_unfavorited`
  - `event_registered` / `event_unregistered`
- Added `subscribeToBlogs()` / `unsubscribeFromBlogs()` methods
- Added `subscribeToEvents()` / `unsubscribeFromEvents()` methods

**Key Improvements:**
```javascript
// Before: Subscription could fail silently if not authenticated
subscribeToFavorites() {
  if (this.socket && this.socket.connected) {
    this.socket.emit('subscribe', { channel: 'favorites' });
  }
}

// After: Queue subscription and retry after authentication
subscribeToChannel(channel) {
  this.pendingChannels.add(channel);
  
  if (this.socket && this.socket.connected && this.isAuthenticated) {
    this.socket.emit('subscribe', { channel });
  } else {
    console.log(`Subscription queued for ${channel} (will subscribe after auth)`);
  }
}
```

#### 2. Favorites Hook (`client/src/hooks/useFavorites.js`)
**Changes:**
- Removed premature cache invalidation in mutation success callbacks
- Improved optimistic update logic to handle WebSocket race conditions
- Reduced auto-refresh interval from 5 seconds to 30 seconds (since WebSocket now works properly)
- Better duplicate detection in mutation success handlers

**Key Improvements:**
```javascript
// Before: Invalidated cache immediately, potentially losing optimistic updates
onSuccess: (response, parkData, context) => {
  // ...replace temp with real data...
  setTimeout(() => {
    queryClient.invalidateQueries(['favorites', userId]);
  }, 500); // ❌ Too aggressive
}

// After: Rely on WebSocket for updates, no premature invalidation
onSuccess: (response, parkData, context) => {
  queryClient.setQueryData(['favorites', userId], (old = []) => {
    // Check if WebSocket already added it
    const existingIndex = old.findIndex(fav => 
      fav.parkCode === parkData.parkCode && !fav._id?.startsWith('temp-')
    );
    if (existingIndex >= 0) {
      // Remove temp, keep WebSocket version
      return old.filter(fav => 
        !(fav._id?.startsWith('temp-') && fav.parkCode === parkData.parkCode)
      );
    }
    // Replace temp with real data
    return old.map(fav => 
      fav._id?.startsWith('temp-') && fav.parkCode === parkData.parkCode 
        ? response.data 
        : fav
    );
  });
  // No invalidation - optimistic update + WebSocket = smooth UX ✓
}
```

#### 3. WebSocket Hook (`client/src/hooks/useWebSocket.js`)
**Changes:**
- Added `subscribeToBlogs()` and `unsubscribeFromBlogs()` exports
- Added `subscribeToEvents()` and `unsubscribeFromEvents()` exports

### Server-Side Fixes

#### 1. Blog Controller (`server/src/controllers/blogController.js`)
**Changes:**
- Added WebSocket notifications to `toggleFavorite` function
- Emits `blog_favorited` or `blog_unfavorited` events to user's blogs channel

**Code Added:**
```javascript
// Notify via WebSocket
const wsService = req.app.get('wsService');
if (wsService) {
  if (isFavorited) {
    wsService.sendToUserChannel(userId, 'blogs', 'blog_unfavorited', { 
      blogId: post._id,
      isFavorited: false,
      favoritesCount: post.favorites.length
    });
  } else {
    wsService.sendToUserChannel(userId, 'blogs', 'blog_favorited', { 
      blogId: post._id,
      isFavorited: true,
      favoritesCount: post.favorites.length
    });
  }
}
```

#### 2. Event Controller (`server/src/controllers/eventController.js`)
**Changes:**
- Added WebSocket notifications to `registerForEvent` function
- Added WebSocket notifications to `unregisterFromEvent` function
- Emits `event_registered` or `event_unregistered` events to user's events channel

**Code Added:**
```javascript
// Notify via WebSocket - Register
const wsService = req.app.get('wsService');
if (wsService) {
  wsService.sendToUserChannel(req.user.id, 'events', 'event_registered', { 
    eventId: event._id,
    eventTitle: event.title,
    isRegistered: true
  });
}

// Notify via WebSocket - Unregister
const wsService = req.app.get('wsService');
if (wsService) {
  wsService.sendToUserChannel(req.user.id, 'events', 'event_unregistered', { 
    eventId: event._id,
    eventTitle: event.title,
    isRegistered: false
  });
}
```

## How It Works Now

### Authentication & Subscription Flow

1. **Client connects** to WebSocket server
2. **Server receives connection** and waits for authentication
3. **Client sends authentication** with JWT token
4. **Server validates token** and sets `socket.userId`
5. **Server emits `authenticated` event** to client
6. **Client receives `authenticated`** and calls `resubscribeAllChannels()`
7. **All pending subscriptions are sent** to server
8. **Server processes subscriptions** (now userId exists, so it works!)
9. **Client is subscribed** to favorites, blogs, events, etc.

### Real-Time Update Flow

#### For Parks:
1. User clicks favorite button
2. **Optimistic update** adds temp favorite to UI immediately (instant feedback ✓)
3. **API call** made to backend
4. **Backend saves** to database
5. **Backend emits** WebSocket event `favorite_added`
6. **Client receives** WebSocket event
7. **Cache updated** with real data, temp removed
8. **UI updates** (or stays the same if already optimistic)

#### For Blogs:
1. User clicks favorite button on blog
2. **Optimistic update** (if implemented in blog component)
3. **API call** to `/api/blogs/:id/favorite`
4. **Backend toggles** favorite in BlogPost model
5. **Backend emits** `blog_favorited` or `blog_unfavorited`
6. **Client receives** event and updates UI

#### For Events:
1. User clicks register/unregister button
2. **Optimistic update** (if implemented)
3. **API call** to `/api/events/:id/register`
4. **Backend updates** event.registrations array
5. **Backend emits** `event_registered` or `event_unregistered`
6. **Client receives** event and updates UI

## Testing Checklist

### Park Favorites
- [ ] Click favorite button on park detail page
- [ ] Red heart should appear IMMEDIATELY (no page refresh needed)
- [ ] Open same park in another tab
- [ ] Favorite in one tab, should update in other tab within ~1 second
- [ ] Check profile page favorites count updates in real-time
- [ ] Check profile page favorites tab updates in real-time

### Blog Favorites
- [ ] Click favorite button on blog post
- [ ] Button should update IMMEDIATELY
- [ ] Favorite count should increment/decrement immediately
- [ ] Open same blog in another tab
- [ ] Changes should sync between tabs

### Event Registration
- [ ] Click register button on event
- [ ] Button should update IMMEDIATELY
- [ ] Open same event in another tab
- [ ] Registration status should sync between tabs

### WebSocket Connection
- [ ] Check browser console for WebSocket connection messages
- [ ] Should see: `[WebSocket] Connected to server`
- [ ] Should see: `[WebSocket] Authenticated successfully`
- [ ] Should see: `[WebSocket] Subscribing to channel: favorites`
- [ ] Should see: `[WebSocket] Emitting subscribe for channel: favorites`

## Files Modified

### Client Files
1. `client/src/services/websocketService.js` - Enhanced subscription logic with authentication awareness
2. `client/src/hooks/useFavorites.js` - Improved optimistic updates and removed premature invalidation
3. `client/src/hooks/useWebSocket.js` - Added blog and event channel subscriptions

### Server Files
1. `server/src/controllers/blogController.js` - Added WebSocket notifications for blog favorites
2. `server/src/controllers/eventController.js` - Added WebSocket notifications for event registration

## Benefits

1. ✅ **Instant UI Feedback**: Users see changes immediately without waiting for network requests
2. ✅ **Real-Time Sync**: Changes sync across tabs/devices in ~1 second
3. ✅ **Better UX**: No page refreshes needed to see updated favorites/registrations
4. ✅ **Consistent State**: Optimistic updates + WebSocket events = always in sync
5. ✅ **Network Resilience**: Auto-refresh fallback (30s) catches any missed WebSocket events
6. ✅ **Proper Error Handling**: Failed mutations rollback optimistic updates

## Future Improvements

1. Add optimistic updates to blog favorite buttons (similar to parks)
2. Add optimistic updates to event registration buttons
3. Consider adding loading states during mutation
4. Add retry logic for failed WebSocket subscriptions
5. Add reconnection toasts to notify users when WebSocket reconnects
6. Consider adding optimistic update animations (e.g., heart pulse effect)

---

**Date Fixed**: October 14, 2025  
**Issue Reporter**: User experiencing non-real-time updates  
**Fix Status**: ✅ Complete - Ready for testing

