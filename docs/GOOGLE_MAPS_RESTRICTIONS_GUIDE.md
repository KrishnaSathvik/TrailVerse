# 🔒 Google Maps API Key Restrictions - Production Setup

## 🎯 **Why Restrictions Are Critical**

Without proper restrictions:
- ❌ **Security Risk**: Anyone can use your API keys
- ❌ **Cost Explosion**: Unlimited usage = huge bills
- ❌ **Quota Exhaustion**: Keys can be exhausted by malicious users

## 🔧 **Server API Key Restrictions (Render Backend)**

### **Current Status:**
- **Key**: Server Api Key
- **Current Restriction**: IP addresses
- **Status**: ✅ Good start, but needs specific IPs

### **Recommended Setup:**

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Navigate to**: APIs & Services → Credentials
3. **Find**: Your "Server Api Key"
4. **Click**: Edit (pencil icon)

### **IP Address Restrictions:**
Add these Render server IP addresses:

```bash
# Render US East (Virginia) - Primary
34.199.54.113
34.199.54.114
34.199.54.115

# Render US West (Oregon) - Backup
44.233.151.27
44.233.151.28
44.233.151.29

# Render Global CDN IPs
52.84.249.0/24
52.84.250.0/24
```

### **API Restrictions:**
Enable only these APIs:
- ✅ **Geocoding API** (if using address lookup)
- ✅ **Places API** (if using place search)
- ✅ **Maps JavaScript API** (if server renders maps)
- ✅ **Distance Matrix API** (if calculating distances)

## 🌐 **Maps Platform API Key Restrictions (Vercel Frontend)**

### **Current Status:**
- **Key**: Maps Platform API Key
- **Current Restriction**: HTTP referrers
- **Status**: ✅ Good, but needs specific domains

### **Recommended Setup:**

1. **Go to [Google Cloud Console](https://console.cloud.google.com/)**
2. **Navigate to**: APIs & Services → Credentials
3. **Find**: Your "Maps Platform API Key"
4. **Click**: Edit (pencil icon)

### **HTTP Referrer Restrictions:**
Add these domains:

```bash
# Production Domain
https://www.nationalparksexplorerusa.com/*
https://nationalparksexplorerusa.com/*

# Vercel Preview URLs (for testing)
https://*.vercel.app/*
https://trail-verse-*.vercel.app/*

# Development (optional)
http://localhost:3000/*
http://127.0.0.1:3000/*
```

### **API Restrictions:**
Enable only these APIs:
- ✅ **Maps JavaScript API** (for map display)
- ✅ **Places API** (for place search)
- ✅ **Geocoding API** (for address lookup)
- ❌ **Server-side APIs** (not needed for frontend)

## 📊 **Detailed Restriction Setup**

### **Step-by-Step for Server API Key:**

1. **Open Google Cloud Console**
2. **Go to**: APIs & Services → Credentials
3. **Find**: "Server Api Key" → Click Edit
4. **Application restrictions**: Select "IP addresses"
5. **Add IPs**: Paste the Render IP addresses above
6. **API restrictions**: Select "Restrict key"
7. **Select APIs**: Choose only the server-side APIs you need
8. **Save**

### **Step-by-Step for Maps Platform API Key:**

1. **Open Google Cloud Console**
2. **Go to**: APIs & Services → Credentials
3. **Find**: "Maps Platform API Key" → Click Edit
4. **Application restrictions**: Select "HTTP referrers"
5. **Add referrers**: Paste the domain restrictions above
6. **API restrictions**: Select "Restrict key"
7. **Select APIs**: Choose only the frontend APIs you need
8. **Save**

## 🔍 **How to Find Your Render Server IPs**

If you need the exact IP addresses:

1. **Go to Render Dashboard**
2. **Select your service**
3. **Go to**: Logs tab
4. **Look for**: Outbound IP addresses in logs
5. **Or check**: Network settings in your service

### **Alternative Method:**
```bash
# Check your Render service logs for outbound IPs
# Or contact Render support for your service's static IPs
```

## ⚠️ **Important Notes**

### **Server API Key:**
- **Use for**: Server-side requests (geocoding, places API)
- **Restrict to**: Render server IP addresses only
- **APIs**: Geocoding, Places API, Distance Matrix

### **Maps Platform API Key:**
- **Use for**: Client-side map loading
- **Restrict to**: Your domain only
- **APIs**: Maps JavaScript API, Places API (client-side)

## 🚨 **Security Best Practices**

### **Do:**
- ✅ **Always restrict** both keys
- ✅ **Use specific IPs** for server key
- ✅ **Use specific domains** for client key
- ✅ **Enable only needed APIs**
- ✅ **Monitor usage** in Google Cloud Console
- ✅ **Set up billing alerts**

### **Don't:**
- ❌ **Never leave keys unrestricted**
- ❌ **Don't use server key in frontend**
- ❌ **Don't use client key on server**
- ❌ **Don't enable unused APIs**
- ❌ **Don't ignore billing alerts**

## 📈 **Monitoring & Alerts**

### **Set Up Billing Alerts:**
1. **Go to**: Google Cloud Console → Billing
2. **Click**: Budgets & alerts
3. **Create budget**: Set limit (e.g., $50/month)
4. **Set alerts**: 50%, 90%, 100% of budget
5. **Add email**: Your admin email

### **Monitor Usage:**
1. **Go to**: APIs & Services → Dashboard
2. **Check**: Daily usage by API
3. **Review**: Quota usage
4. **Investigate**: Any unusual spikes

## 🎯 **Production Checklist**

### **Server API Key:**
- ✅ Restricted to Render IP addresses
- ✅ Only server-side APIs enabled
- ✅ Geocoding/Places API configured

### **Maps Platform API Key:**
- ✅ Restricted to your domain
- ✅ Only client-side APIs enabled
- ✅ Maps JavaScript API configured

### **Monitoring:**
- ✅ Billing alerts set up
- ✅ Usage monitoring enabled
- ✅ Quota limits configured

## 🚀 **After Setup:**

1. **Test both environments** (dev and production)
2. **Verify maps load properly**
3. **Check API usage** in Google Cloud Console
4. **Monitor for any errors**
5. **Set up regular usage reviews**

## 💡 **Pro Tips:**

- **Rotate keys periodically** (every 6-12 months)
- **Use different keys** for different environments
- **Monitor usage patterns** for optimization
- **Keep documentation** of all restrictions

**Your Google Maps integration will be secure, cost-controlled, and production-ready!** 🗺️🔒
