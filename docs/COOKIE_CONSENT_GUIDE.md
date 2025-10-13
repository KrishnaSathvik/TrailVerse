# Cookie Consent Banner Implementation Guide

## 🍪 Overview

TrailVerse uses **localStorage** (browser storage similar to cookies) to enhance user experience. We've implemented a GDPR-compliant cookie consent banner that allows users to control their privacy preferences.

## 📋 What Data We Store (LocalStorage)

### 1. **Essential** (Always Active - Required)
- **Authentication tokens** (`token`) - Keeps users logged in
- **User data** (`user`) - Stores basic account information
- **Session management** - Maintains secure sessions

### 2. **Functional** (User Preference)
- **Theme preferences** (`theme`) - Remembers dark/light mode choice
- **Trip history** (`trip_history`) - Saves AI-generated trip plans
- **Saved events** - Parks events you've bookmarked
- **AI chat state** (`planai-chat-state`) - Preserves AI conversation context
- **User preferences** - Personal settings and favorites
- **Favorite parks** - Parks you've liked/saved
- **Visited parks** - Parks you've marked as visited

### 3. **Analytics** (User Preference)
- **Analytics session ID** (`analytics_session_id`) - Tracks unique sessions
- **Analytics opt-out** (`analytics_opt_out`) - Respects user privacy choice
- **Google Analytics data** - Usage patterns and platform performance

### 4. **Performance** (User Preference)
- **Cache data** - Speeds up park data loading
- **Performance reports** - Monitors app speed and errors
- **API response caching** - Reduces server load and improves speed

## 🎨 Banner Features

### Main Banner
- ✅ Beautiful card design matching your existing UI
- ✅ Cookie icon with TrailVerse green accent
- ✅ Clear explanation of data usage
- ✅ Link to Privacy Policy
- ✅ Three action buttons:
  - **Accept All** - Enable all features
  - **Reject All** - Only essential (minimal functionality)
  - **Customize** - Choose specific preferences

### Settings Panel
- ✅ Detailed breakdown of each category
- ✅ Toggle switches for each preference
- ✅ Visual feedback with green borders when enabled
- ✅ Essential category locked (always required)
- ✅ Save or cancel options

### UX/UI Design
- ✅ Matches your existing design system
- ✅ Uses CSS variables for theming
- ✅ Backdrop blur and shadows
- ✅ Smooth slide-up animation
- ✅ Responsive (mobile/tablet/desktop)
- ✅ Accessible keyboard navigation
- ✅ Shows only once per user
- ✅ 1-second delay before showing (better UX)

## 🔧 Implementation

### Files Created
1. **`client/src/components/common/CookieConsent.jsx`**
   - Main cookie consent banner component
   - Handles user preferences
   - Stores consent in localStorage

### Files Modified
1. **`client/src/App.jsx`**
   - Added CookieConsent import
   - Integrated banner globally (shows on all pages)

## 💻 How It Works

### First Visit
1. User visits TrailVerse
2. After 1 second delay, cookie banner slides up from bottom
3. User can:
   - Click "Accept All" → All features enabled
   - Click "Reject All" → Only essential features
   - Click "Customize" → Choose specific preferences

### Consent Storage
```javascript
// Stored in localStorage as:
{
  "essential": true,      // Always true
  "functional": true,     // User choice
  "analytics": true,      // User choice
  "performance": true,    // User choice
  "timestamp": "2025-01-08T12:00:00.000Z"
}
```

### Return Visits
- Banner doesn't show again (consent stored)
- User choices are respected
- Analytics disabled if user rejected it

## 🔒 Privacy Compliance

### GDPR Compliant
- ✅ Users must opt-in (not pre-checked)
- ✅ Essential cookies clearly marked
- ✅ Clear explanations for each category
- ✅ Easy to reject all non-essential
- ✅ Privacy Policy linked
- ✅ Consent timestamped

### User Rights
- ✅ Right to accept or reject
- ✅ Right to customize preferences
- ✅ Right to view Privacy Policy
- ✅ Right to close banner
- ✅ Clear information about data usage

## 🎯 Benefits

### For Users
- **Transparency** - Know exactly what data is stored
- **Control** - Choose what to enable/disable
- **Privacy** - Can reject analytics and tracking
- **Speed** - Can disable performance caching if desired

### For TrailVerse
- **Legal Compliance** - Meets GDPR/CCPA requirements
- **Trust** - Shows respect for user privacy
- **Analytics** - Users who opt-in provide better data
- **Professional** - Matches modern web standards

## 🧪 Testing

### Test Scenarios
1. **First Visit**
   - Clear localStorage
   - Refresh page
   - Banner should appear after 1 second

2. **Accept All**
   - Click "Accept All"
   - Check localStorage for `cookie_consent`
   - Banner should disappear
   - Refresh page - banner should NOT reappear

3. **Reject All**
   - Clear localStorage
   - Click "Reject All"
   - Check `analytics_opt_out` is set to 'true'
   - Only essential features should work

4. **Customize**
   - Click "Customize"
   - Toggle different preferences
   - Click "Save Preferences"
   - Check localStorage reflects choices

5. **Responsive**
   - Test on mobile (320px width)
   - Test on tablet (768px width)
   - Test on desktop (1920px width)
   - All layouts should work perfectly

## 🚀 Future Enhancements

### Potential Additions
- [ ] Add "Manage Cookies" link in footer
- [ ] Allow users to change preferences later
- [ ] Add cookie policy page (separate from Privacy)
- [ ] Track consent versions (if policy changes)
- [ ] Add more granular controls (specific analytics features)

### Optional Features
- [ ] Remember consent across subdomains
- [ ] Export consent preferences
- [ ] Show consent history in profile
- [ ] Multi-language support for banner

## 📱 User Flow

```
User Visits TrailVerse
         ↓
   No consent stored?
         ↓ YES
   Show banner (1s delay)
         ↓
   User sees 3 options
         ↓
    ┌────┴────┬─────────┐
    ↓         ↓         ↓
Accept All  Reject  Customize
    ↓         ↓         ↓
 Enable    Disable  Choose
  All     Non-Ess.  Each
    ↓         ↓         ↓
    └────┬────┴─────────┘
         ↓
   Save to localStorage
         ↓
   Hide banner
         ↓
   Apply preferences
         ↓
   User continues browsing
```

## 🔍 Debugging

### Check Consent Status
```javascript
// In browser console:
const consent = localStorage.getItem('cookie_consent');
console.log(JSON.parse(consent));
```

### Clear Consent (for testing)
```javascript
// In browser console:
localStorage.removeItem('cookie_consent');
location.reload();
```

### Check Analytics Status
```javascript
// In browser console:
const optOut = localStorage.getItem('analytics_opt_out');
console.log('Analytics disabled:', optOut === 'true');
```

## 📚 Related Files

- **Privacy Policy**: `client/src/pages/PrivacyPage.jsx`
- **Terms of Service**: `client/src/pages/TermsPage.jsx`
- **Analytics**: `client/src/utils/analytics.js`
- **Analytics Service**: `client/src/services/analyticsService.js`
- **Theme Context**: `client/src/context/ThemeContext.jsx`
- **Auth Context**: `client/src/context/AuthContext.jsx`

## ✅ Checklist

Before deploying to production:
- [ ] Test banner on all major browsers
- [ ] Test banner on mobile devices
- [ ] Verify localStorage consent is saved
- [ ] Verify analytics respects opt-out
- [ ] Verify essential features work when rejected
- [ ] Test Privacy Policy link works
- [ ] Test responsive design
- [ ] Test keyboard navigation
- [ ] Test with screen reader (accessibility)
- [ ] Verify banner matches design system

## 🎨 Design Tokens Used

```css
--surface           /* Card background */
--surface-hover     /* Preference cards */
--border            /* Card borders */
--text-primary      /* Main text */
--text-secondary    /* Descriptions */
--text-tertiary     /* Fine print */
--accent-green      /* Action buttons, active states */
--accent-green-dark /* Button hover */
```

## 📞 Support

If you need to modify the cookie consent banner:
1. Edit `client/src/components/common/CookieConsent.jsx`
2. Update privacy explanations in `client/src/pages/PrivacyPage.jsx`
3. Test thoroughly before deploying

---

**Note**: TrailVerse doesn't use actual HTTP cookies - we use localStorage, which is client-side storage. This is actually better for privacy since the data never leaves the user's browser unless explicitly sent to the server (like authentication tokens).

