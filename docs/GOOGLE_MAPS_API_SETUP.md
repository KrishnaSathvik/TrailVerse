# 🗺️ Google Maps API Keys Setup Guide

## 📊 **Your Current Google Maps API Keys**

From your Google Cloud Console, you have:
1. **Server Api Key** - For backend/server-side requests
2. **Maps Platform API Key** - For frontend/client-side requests

## 🔧 **Adding to Vercel (Frontend)**

### **Variable to Add:**
```bash
VITE_GMAPS_API_KEY=your-maps-platform-api-key-here
```

### **Steps:**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**
5. **Name:** `VITE_GMAPS_API_KEY`
6. **Value:** Paste your **Maps Platform API Key** (the one with HTTP referrers restriction)
7. **Environments:** Select Production, Preview, Development
8. Click **Save**

### **Or use CLI:**
```bash
vercel env add VITE_GMAPS_API_KEY
# When prompted, enter your Maps Platform API Key
# Select: Production, Preview, Development
```

## 🖥️ **Adding to Render (Backend)**

### **Variable to Add:**
```bash
GMAPS_SERVER_KEY=your-server-api-key-here
```

### **Steps:**
1. Go to [render.com/dashboard](https://render.com/dashboard)
2. Select your backend service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. **Key:** `GMAPS_SERVER_KEY`
6. **Value:** Paste your **Server Api Key** (the one with IP addresses restriction)
7. Click **Add**

### **Or update existing:**
If `GMAPS_SERVER_KEY` already exists in Render, click the eye icon to view it, then click to edit and update the value.

## 🎯 **Which Key Goes Where?**

### **Frontend (Vercel) - Maps Platform API Key:**
- **Used for:** Client-side map loading, user interactions
- **Restriction:** HTTP referrers (your domain)
- **Variable:** `VITE_GMAPS_API_KEY`

### **Backend (Render) - Server Api Key:**
- **Used for:** Server-side requests, geocoding, places API
- **Restriction:** IP addresses (Render server IPs)
- **Variable:** `GMAPS_SERVER_KEY`

## ✅ **Current Status Check**

### **Local Development:**
- ✅ `GMAPS_SERVER_KEY` - Present in server/.env

### **Vercel (Frontend):**
- ❌ `VITE_GMAPS_API_KEY` - **NEEDS TO BE ADDED**

### **Render (Backend):**
- ❓ `GMAPS_SERVER_KEY` - **CHECK IF EXISTS AND UPDATE**

## 🚀 **Quick Setup Commands**

### **Add to Vercel:**
```bash
vercel env add VITE_GMAPS_API_KEY
# Enter your Maps Platform API Key when prompted
```

### **Check Render:**
Go to Render dashboard → Environment → Look for `GMAPS_SERVER_KEY`

## 🔍 **How to Find Your API Key Values**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Find your API keys:
   - **Maps Platform API Key** (HTTP referrers) → Use for Vercel
   - **Server Api Key** (IP addresses) → Use for Render
4. Click the key to view/copy the actual key value

## 📋 **Security Best Practices**

### **Frontend Key (Vercel):**
- ✅ Restrict to your domain only
- ✅ Use HTTP referrers restriction
- ✅ Enable only required APIs (Maps JavaScript API, etc.)

### **Backend Key (Render):**
- ✅ Restrict to specific IP addresses
- ✅ Use server IP restrictions
- ✅ Enable only server-side APIs (Geocoding, Places API, etc.)

## 🧪 **Testing After Setup**

### **Frontend Test:**
1. Deploy to Vercel
2. Check browser console for Google Maps errors
3. Verify maps load properly

### **Backend Test:**
1. Deploy to Render
2. Test any server-side Google APIs
3. Check server logs for authentication errors

## 📝 **Summary**

**You need to add:**
1. **Vercel:** `VITE_GMAPS_API_KEY` = Your Maps Platform API Key
2. **Render:** `GMAPS_SERVER_KEY` = Your Server Api Key (or update existing)

**After adding both:**
- ✅ Frontend maps will work properly
- ✅ Backend Google APIs will work
- ✅ All restrictions properly configured
- ✅ Production ready!

## 🔧 **Quick Action Items**

1. **Add to Vercel:** `VITE_GMAPS_API_KEY`
2. **Check/Update Render:** `GMAPS_SERVER_KEY`
3. **Test both environments**
4. **Deploy and verify**

**Your Google Maps integration will be fully functional!** 🗺️
