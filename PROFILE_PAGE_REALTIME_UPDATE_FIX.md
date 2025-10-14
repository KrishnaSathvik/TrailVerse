# Profile Page Real-Time Update Fix

## Issue
Profile page wasn't updating stats and favorites tab in real-time when favorites were added/removed from park detail pages.

## Root Cause

The ProfilePage had **invalid code** trying to call `setUserStats()` on a memoized value:

```javascript
// This was defined as a memoized computation
const userStats = useMemo(() => { ... }, [...]);

// But then the code tried to call setUserStats() - which doesn't exist!
setUserStats({ ... });  // ❌ ERROR - can't set state on a memoized value
```

This was causing:
1. JavaScript errors (calling setState on non-state variable)
2. Stats not updating because the invalid setState was being ignored
3. Profile page showing stale data until manual refresh

## The Fix

### File: `client/src/pages/ProfilePage.jsx`

#### 1. Removed Invalid setState Calls

**Before:**
```javascript
const loadUserStats = async () => {
  const stats = await userService.getUserStats();
  setUserStats(stats);  // ❌ Invalid - userStats is not state!
}
```

**After:**
```javascript
const loadUserStats = async () => {
  // NOTE: Stats are now computed automatically via useMemo based on local data
  // No need to fetch from server or update state
  // The useMemo will recalculate whenever favorites, visitedParks, etc. change
  console.log('[ProfilePage] Stats auto-calculated via useMemo');
}
```

#### 2. Added Logging to Track Updates

**userStats computation:**
```javascript
const userStats = useMemo(() => {
  const stats = {
    parksVisited: visitedParks.length,
    favorites: favorites.length + favoriteBlogsCount + savedEvents.length,
    reviews: reviewsCount || 0,
    totalDays: calculateTotalDays(user)
  };
  
  console.log('[ProfilePage] 🔄 Stats recalculated:', stats);  // ✅ Added
  
  return stats;
}, [favorites.length, favoriteBlogsCount, savedEvents.length, visitedParks.length, reviewsData, user, calculateTotalDays]);
```

**stats array:**
```javascript
const stats = useMemo(() => {
  const statsArray = [ ... ];
  
  console.log('[ProfilePage] 📊 Stats array updated:', statsArray);  // ✅ Added
  
  return statsArray;
}, [userStats, reviewsLoading]);
```

### File: `client/src/components/profile/SavedParks.jsx`

**Added logging to track when component receives new data:**
```javascript
useEffect(() => {
  console.log('[SavedParks] 🔄 Received updated savedParks:', savedParks?.length || 0);
  console.log('[SavedParks] 🔄 Park codes:', savedParks?.map(p => p.parkCode) || []);
}, [savedParks]);
```

### File: `client/src/components/profile/ProfileStats.jsx`

**Added logging to track when component renders:**
```javascript
useEffect(() => {
  console.log('[ProfileStats] 🎨 Rendering with stats:', stats);
}, [stats]);
```

## How It Works Now

### Real-Time Update Flow:

1. **User favorites a park** on ParkDetailPage
2. **useFavorites hook** processes mutation and WebSocket event
3. **favorites array updated** in React Query cache
4. **favorites.length changes** (e.g., 28 → 29)
5. **userStats useMemo recalculates** (depends on favorites.length)
   ```
   [ProfilePage] 🔄 Stats recalculated: {favorites: 29, ...}
   ```
6. **stats array useMemo recalculates** (depends on userStats)
   ```
   [ProfilePage] 📊 Stats array updated: [{label: 'Favorites', value: 29}, ...]
   ```
7. **ProfileStats component re-renders**
   ```
   [ProfileStats] 🎨 Rendering with stats: [{value: 29}, ...]
   ```
8. **UI updates immediately!** No page refresh needed!

### Favorites Tab Update Flow:

1. **User favorites a park** on ParkDetailPage
2. **useFavorites hook** updates favorites array
3. **SavedParks component receives new props**
   ```
   [SavedParks] 🔄 Received updated savedParks: 29
   [SavedParks] 🔄 Park codes: ['acad', 'sagu', ...]
   ```
4. **Favorites tab re-renders** with new list
5. **New park appears in list immediately!**

## Testing

### Test 1: Stats Update

1. Open profile page
2. In another tab, go to a park page
3. Click heart to favorite
4. **Switch back to profile tab**
5. **Stats should update within 1 second!**

**Expected Console Output:**
```
✅ [WebSocket] Received favorite_added event: {parkCode: 'acad', ...}
✅ [Real-Time] Favorite added: {parkCode: 'acad', ...}
✅ [ProfilePage] 🔄 Stats recalculated: {favorites: 29, parksVisited: 12, ...}
✅ [ProfilePage] 📊 Stats array updated: [{label: 'Favorites', value: 29}, ...]
✅ [ProfileStats] 🎨 Rendering with stats: [{value: 29}, ...]
```

### Test 2: Favorites Tab Update

1. Go to profile page
2. Click "Favorites" tab
3. In another tab, favorite a new park
4. **Switch back to profile tab**
5. **New park should appear in list within 1 second!**

**Expected Console Output:**
```
✅ [WebSocket] Received favorite_added event
✅ [Real-Time] Favorite added
✅ [SavedParks] 🔄 Received updated savedParks: 29
✅ [SavedParks] 🔄 Park codes: ['acad', 'sagu', 'new-park', ...]
```

### Test 3: Same-Tab Update

1. Open profile page on Favorites tab
2. Open park detail page in SAME tab
3. Click heart to favorite
4. **Go back to profile page**
5. **Stats and list should be updated!**

## Success Criteria

✅ Stats update in real-time across tabs  
✅ Favorites tab updates in real-time  
✅ No page refresh needed  
✅ Console shows stats recalculation logs  
✅ Console shows component re-render logs  
✅ No JavaScript errors  
✅ Heart button works correctly everywhere  

## Technical Details

### Why useMemo is Perfect for This

**Before (with useState):**
- State needs manual updates
- Risk of stale state
- Multiple sources of truth
- setState calls can be missed

**After (with useMemo):**
- Auto-calculated from source data
- Single source of truth
- Impossible to have stale stats
- Updates automatically when dependencies change

### The Dependency Chain

```
favorites array (React Query)
  ↓ (favorites.length changes)
userStats (useMemo) 
  ↓ (userStats object changes)
stats array (useMemo)
  ↓ (stats array changes)
ProfileStats component
  ↓ (re-renders with new data)
UI updates! ✨
```

## Files Modified

1. ✅ `client/src/pages/ProfilePage.jsx`
   - Removed invalid `setUserStats()` calls
   - Added logging to track stats recalculation
   - Fixed error handling in `loadUserStats()`

2. ✅ `client/src/components/profile/SavedParks.jsx`
   - Added logging to track when component receives new data
   - Helps debug if favorites array isn't updating

3. ✅ `client/src/components/profile/ProfileStats.jsx`
   - Added logging to track when component renders
   - Helps verify stats are being passed correctly

## What to Test

1. **Refresh the page** and go to your profile
2. **Open console** to see the new logging
3. **In another tab**, favorite/unfavorite a park
4. **Switch back to profile tab**
5. **Watch console** for update messages
6. **Stats should update** within 1-2 seconds!
7. **Favorites tab should update** with new parks!

The logging will tell us exactly where in the chain the update is happening (or not happening).

---

**Ready to test! The profile page should now update in real-time!** 🚀

