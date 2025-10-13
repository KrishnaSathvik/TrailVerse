# AI Facts Integration - NPS + Weather Data

## 🎯 Overview

This implementation provides **real-time NPS and Weather facts** to your AI model, eliminating hallucinations and providing accurate, up-to-date information. The system uses **server-side injection** to keep API keys secure while giving the AI model grounded facts before it generates responses.

## 🏗️ Architecture

### **Option A: Server-Side Injection (Implemented)**

- ✅ **Secure**: API keys stay on server (no client exposure)
- ✅ **Efficient**: Facts fetched only when relevant to user's question
- ✅ **Accurate**: AI sees real data before generating responses
- ✅ **Cached**: Smart caching reduces API costs

## 📁 Files Created/Modified

### **New Files**
- `server/src/services/factsService.js` - Core facts fetching logic

### **Modified Files**
- `server/src/routes/ai.js` - Enhanced to inject facts before AI calls
- `server/src/controllers/parkController.js` - Added alerts endpoint
- `server/src/routes/parks.js` - Added alerts route
- `client/src/services/npsApi.js` - Added client-side alerts method
- `client/src/components/plan-ai/TripPlannerChat.jsx` - Passes coordinates/metadata

## 🔧 How It Works

### 1. **User Sends Message**
```javascript
// Frontend sends metadata with chat request
const data = await aiService.chat({
  messages: [...],
  metadata: {
    parkCode: 'yose',
    parkName: 'Yosemite National Park',
    lat: 37.8651,
    lon: -119.5383,
    userId: 'user123'
  }
});
```

### 2. **Server Analyzes Message**
```javascript
// Server checks if facts are needed
const needsWeather = /(weather|forecast|temperature|rain)/i.test(userMessage);
const needsNPS = /(alerts|closures|permits|trails|activities)/i.test(userMessage);
```

### 3. **Facts Fetched in Parallel**
```javascript
// Weather facts (if coordinates + weather keywords)
const weatherFacts = await fetchWeatherFacts({ lat, lon });
// Result: "Weather (next 3 days):\n- Wed Oct 09: High 72°, Low 45°, clear sky, precip 0%\n..."

// NPS facts (if parkCode + NPS keywords)  
const npsFacts = await fetchNPSFacts({ parkCode });
// Result: "Highlights:\n- Hiking\n- Photography\n- Wildlife Viewing\n\nActive Alerts:\n- Trail Closure (Caution)"
```

### 4. **Facts Injected as System Messages**
```javascript
// Facts become high-authority system messages
const factMessages = [
  { 
    role: 'system', 
    content: `NPS FACTS for Yosemite National Park:\n${npsFacts}\n\nUse these in answers. Do not invent closures or permits.` 
  },
  { 
    role: 'system', 
    content: `LIVE WEATHER FACTS for Yosemite National Park:\n${weatherFacts}\nDo not guess weather beyond these facts.` 
  }
];

// Combined with conversation
const augmentedMessages = [...factMessages, ...conversation];
```

### 5. **AI Generates Grounded Response**
The AI now has access to real facts and will reference them instead of hallucinating.

## 🎯 Expected Results

### **Before** (Hallucination-Prone)
```
User: "What are the current alerts at Yosemite?"
AI: "Based on typical conditions, there may be some trail closures due to weather..."
```

### **After** (Fact-Grounded)
```
User: "What are the current alerts at Yosemite?"
AI: "According to the latest NPS data, here are the current alerts at Yosemite:
- Trail Closure on Mist Trail (Caution) - Due to maintenance
- None other reported

For the most up-to-date information, check the official NPS website..."
```

## 🔑 Environment Variables Required

Add these to your **server** `.env` file:

```bash
# Weather API (server-side only)
OPENWEATHER_API_KEY=your_openweather_api_key_here

# NPS API (already configured)
NPS_API_KEY=your_nps_api_key_here
```

⚠️ **Important**: Move `REACT_APP_OPENWEATHER_API_KEY` from client to server as `OPENWEATHER_API_KEY` for security.

## 🧪 Testing the Implementation

### **Test Weather Facts**
```
User: "What's the weather like this weekend at Yosemite?"
Expected: AI references actual 3-day forecast from OpenWeather
```

### **Test NPS Facts**
```
User: "Are there any trail closures or alerts?"
Expected: AI lists actual NPS alerts/activities from API
```

### **Test Fallback**
```
User: "What's the general climate like in winter?"
Expected: AI provides seasonal guidance (no live data needed)
```

## 📊 Smart Caching & Performance

### **Weather Facts**
- **Cache**: 5-15 minutes per (lat,lon) coordinate
- **Trigger**: Weather-related keywords in user message
- **Fallback**: Seasonal guidance if API fails

### **NPS Facts**
- **Cache**: 5 minutes for alerts, 12 hours for park details
- **Trigger**: NPS-related keywords (alerts, closures, activities)
- **Fallback**: General park information if API fails

## 🚀 Benefits

1. **🎯 Accurate Responses**: AI uses real data instead of guessing
2. **🔒 Secure**: API keys protected on server
3. **💰 Cost-Effective**: Smart caching reduces API calls
4. **⚡ Fast**: Facts fetched in parallel, cached intelligently
5. **🛡️ Robust**: Graceful fallbacks when APIs fail
6. **🎨 Seamless**: Works with both Claude and OpenAI

## 🔄 Backend API Changes

### **Enhanced `/ai/chat` Endpoint**
```javascript
// New payload format (backward compatible)
{
  "messages": [...],
  "provider": "claude",
  "temperature": 0.4,
  "top_p": 0.9,
  "max_tokens": 2000,
  "metadata": {
    "parkCode": "yose",
    "parkName": "Yosemite",
    "lat": 37.8651,
    "lon": -119.5383
  }
}
```

### **New `/parks/:parkCode/alerts` Endpoint**
```javascript
GET /api/parks/yose/alerts
// Returns current alerts for the park
```

## 🎛️ Configuration Options

### **Keyword Matching**
Modify `factsService.js` to adjust when facts are fetched:

```javascript
// Weather keywords
const weatherKeywords = /(weather|forecast|temperature|rain|snow|wind|sunny|cloud|storm|hot|cold|precipitation|humidity|climate)/i;

// NPS keywords  
const npsKeywords = /(alerts|closures|permits|trails|activities|highlights|campgrounds|visitor center|ranger|events)/i;
```

### **Cache Duration**
```javascript
// In factsService.js
const WEATHER_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const NPS_CACHE_TTL = 5 * 60 * 1000;      // 5 minutes
```

## 🐛 Troubleshooting

### **No Facts Being Fetched**
1. Check environment variables are set on server
2. Verify user message contains relevant keywords
3. Ensure metadata includes required fields (parkCode, lat/lon)

### **API Errors**
1. Check API key validity
2. Verify rate limits not exceeded
3. Check network connectivity from server

### **Facts Not Used by AI**
1. Verify facts are being injected as system messages
2. Check system prompt includes fact usage instructions
3. Test with simple weather/NPS questions

## 🎉 Success Metrics

After implementation, you should see:

- ✅ **No more weather hallucinations** - AI admits when it lacks live data
- ✅ **Accurate park alerts** - AI cites real NPS alerts instead of guessing
- ✅ **Better user trust** - Responses reference official sources
- ✅ **Reduced generic answers** - AI uses specific park/weather facts
- ✅ **Improved trip planning** - More actionable, fact-based recommendations

The AI will now provide **grounded, factual responses** while maintaining its helpful, conversational tone! 🚀
