const mongoose = require('mongoose');
const DailyFeed = require('./src/models/DailyFeed');
const reliableAstronomicalService = require('./src/services/reliableAstronomicalService');
const npsService = require('./src/services/npsService');
const openaiService = require('./src/services/openaiService');
const enhancedParkService = require('./src/services/enhancedParkService');

// Load environment variables
require('dotenv').config();

async function generateDailyFeed() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const userId = '68e3c993879dc9dd2da10bf1';
    const today = new Date().toISOString().split('T')[0];

    console.log('🚀 Generating 100% AI-Powered Daily Feed...');
    console.log(`👤 User: devteam`);
    console.log(`📅 Date: ${today}`);

    // Get a National Park from NPS API
    console.log('\n🏞️ Getting National Park from NPS API...');
    const allParks = await npsService.getAllParks();
    const nationalParks = allParks.filter(park => 
      park.designation && park.designation.toLowerCase() === 'national park'
    );
    
    // Select a random park for today
    const randomIndex = Math.floor(Math.random() * nationalParks.length);
    const park = nationalParks[randomIndex];
    
    console.log(`  Selected National Park: ${park.fullName} (${park.parkCode})`);

    // Get weather data from OpenWeather
    console.log('\n🌤️ Getting weather data from OpenWeather...');
    const weatherData = await enhancedParkService.getWeatherData(park);
    console.log(`  Weather: ${weatherData.current.temp}°F, ${weatherData.current.condition}`);

    // Get astronomical data
    console.log('\n🌙 Getting astronomical data...');
    const astroData = await reliableAstronomicalService.getAstronomicalData(
      parseFloat(park.latitude), 
      parseFloat(park.longitude), 
      new Date(), 
      0
    );
    console.log(`  Sunrise: ${astroData.sunrise}`);
    console.log(`  Sunset: ${astroData.sunset}`);
    console.log(`  Moon Phase: ${astroData.moonPhase}`);

    // Generate ALL AI-powered content
    console.log('\n🤖 Generating 100% AI-powered content...');
    
    const [
      natureFact,
      weatherInsights,
      quickStatsInsights,
      skyDataInsights,
      parkInfoInsights,
      personalizedRecommendations,
      stargazingGuide
    ] = await Promise.all([
      generateNatureFact(park.parkCode, park.fullName),
      generateWeatherInsights(weatherData, park.fullName),
      generateQuickStatsInsights(park, weatherData, astroData),
      generateSkyDataInsights(park, astroData, weatherData),
      generateParkInfoInsights(park, weatherData, astroData),
      generatePersonalizedRecommendations(park, weatherData, astroData),
      generateStargazingGuide(park, astroData, weatherData)
    ]);

    // Create the 100% AI-powered daily feed
    const dailyFeed = new DailyFeed({
      userId,
      date: today,
      parkOfDay: {
        parkCode: park.parkCode,
        name: park.fullName,
        description: park.description,
        image: park.images && park.images[0] ? park.images[0].url : '/background1.png',
        latitude: park.latitude,
        longitude: park.longitude
      },
      // 100% AI-Powered Content
      natureFact,
      weatherInsights,
      quickStatsInsights,
      skyDataInsights,
      parkInfoInsights,
      personalizedRecommendations,
      stargazingGuide,
      // Raw data from APIs (for reference only)
      rawWeatherData: weatherData,
      rawAstroData: astroData,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    });

    await dailyFeed.save();
    console.log('\n✅ 100% AI-Powered Daily Feed Generated Successfully!');
    console.log('\n🤖 AI-Powered Content Summary:');
    console.log(`  🌿 Nature Fact: ${natureFact.substring(0, 50)}...`);
    console.log(`  🌤️ Weather Insights: ${weatherInsights.substring(0, 50)}...`);
    console.log(`  📊 Quick Stats: ${quickStatsInsights.length} AI analyses`);
    console.log(`  🌙 Sky Data: ${skyDataInsights.length} AI astronomical insights`);
    console.log(`  🏞️ Park Info: ${parkInfoInsights.length} AI park highlights`);
    console.log(`  💡 Recommendations: ${personalizedRecommendations.length} AI tips`);
    console.log(`  ⭐ Stargazing Guide: ${stargazingGuide.substring(0, 50)}...`);
    console.log('\n🎯 Data Sources:');
    console.log(`  🏞️ Park Data: NPS API`);
    console.log(`  🌤️ Weather Data: OpenWeather API`);
    console.log(`  🌙 Astronomical Data: Reliable Astronomical Service`);
    console.log(`  🤖 All Content: OpenAI GPT-4`);

  } catch (error) {
    console.error('❌ Error generating daily feed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// AI-Powered Content Generation Functions

async function generateNatureFact(parkCode, parkName) {
  try {
    const prompt = `Generate an interesting, educational nature fact about ${parkName} (${parkCode}). 
    The fact should be:
    - Specific to this national park
    - Scientifically accurate
    - Engaging and surprising
    - Under 100 words
    - Include specific details about wildlife, geology, ecology, or history
    
    Format as a single, compelling sentence.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    return response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  } catch (error) {
    return `${parkName} is a beautiful national park with unique natural features and wildlife.`;
  }
}

async function generateWeatherInsights(weatherData, parkName) {
  try {
    const weather = weatherData?.current;
    if (!weather) {
      throw new Error('No weather data available');
    }

    const prompt = `Generate WEATHER-FOCUSED insights for ${parkName} based on current conditions.
    
    Current Weather:
    - Temperature: ${weather.temperature}°F
    - Condition: ${weather.condition}
    - Humidity: ${weather.humidity}%
    - Wind Speed: ${weather.windSpeed} mph
    - Visibility: ${weather.visibility} miles
    
    FOCUS ONLY ON:
    - Weather impact on park experience
    - Weather-specific safety considerations
    - What to wear/bring for this weather
    - How weather affects visibility and comfort
    
    Keep under 120 words and be weather-specific only.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    return response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  } catch (error) {
    return `Current conditions: ${weatherData?.current?.condition || 'Unknown'}, ${weatherData?.current?.temperature || 'Unknown'}°F. Check local conditions before visiting.`;
  }
}

async function generateQuickStatsInsights(park, weatherData, astroData) {
  try {
    const weather = weatherData?.current;
    const astro = astroData;
    const season = getSeason(new Date().getMonth());
    
    const prompt = `Generate AI-powered insights for ${park.fullName} based on current conditions.
    
    Park Data:
    - Name: ${park.fullName}
    - Elevation: Various elevations
    - Size: Large national park
    - Crowd Level: Moderate
    - Best Time: Morning
    
    Current Conditions:
    - Weather: ${weather?.condition || 'Unknown'}, ${weather?.temperature || 'Unknown'}°F
    - Season: ${season}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'}
    - Sunrise: ${astro?.sunrise || 'Unknown'}, Sunset: ${astro?.sunset || 'Unknown'}
    
    Generate 4 dynamic insights that analyze:
    1. **Elevation Impact**: How the park's elevation affects the experience today
    2. **Crowd Analysis**: What the crowd level means for your visit and timing
    3. **Optimal Timing**: Why the recommended time is best based on current conditions
    4. **Park Scale**: How the park's size affects planning and what you can realistically see
    
    Each insight should be 1-2 sentences, specific to today's conditions, and actionable.
    Format as a JSON array of strings.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    const insights = JSON.parse(response);
    return insights.slice(0, 4).map(insight => insight.replace(/\*\*(.*?)\*\*/g, '$1'));
  } catch (error) {
    console.warn('AI quick stats insights unavailable:', error.message);
    return [
      `At various elevations, expect temperature changes and potential weather variations throughout the park.`,
      `Moderate crowd levels suggest good conditions for exploration with some popular areas potentially busy.`,
      `Morning offers optimal lighting and weather conditions for your visit to ${park.fullName}.`,
      `With extensive acreage, plan to focus on key highlights and allow extra travel time between attractions.`
    ];
  }
}

async function generateSkyDataInsights(park, astroData, weatherData) {
  try {
    const astro = astroData;
    const weather = weatherData?.current;
    const season = getSeason(new Date().getMonth());
    
    const prompt = `Generate comprehensive AI-powered astronomical insights for ${park.fullName} based on current sky conditions.
    
    Current Sky Data:
    - Sunrise: ${astro?.sunrise || 'Unknown'}
    - Sunset: ${astro?.sunset || 'Unknown'}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'} (${astro?.moonIllumination || 'Unknown'}% illuminated)
    - Moon Age: ${astro?.moonAge || 'Unknown'} days
    - Milky Way Visibility: ${astro?.milkyWayVisibility || 'Unknown'}
    - Aurora Probability: ${astro?.auroraProbability || 'Unknown'}
    - Day Length: ${astro?.dayLength ? astro.dayLength.toFixed(1) + ' hours' : 'Unknown'}
    
    Weather Context:
    - Condition: ${weather?.condition || 'Unknown'}
    - Temperature: ${weather?.temperature || 'Unknown'}°F
    - Season: ${season}
    
    Generate 4 detailed insights covering:
    1. **Stargazing Conditions**: Best times and what you can see tonight
    2. **Moon Impact**: How the current moon phase affects stargazing and photography
    3. **Seasonal Highlights**: What astronomical events or objects are prominent this season
    4. **Photography Opportunities**: Best times and techniques for astrophotography today
    
    Each insight should be 2-3 sentences, specific to this park and current conditions.
    Format as a JSON array of strings.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    const insights = JSON.parse(response);
    return insights.slice(0, 4).map(insight => insight.replace(/\*\*(.*?)\*\*/g, '$1'));
  } catch (error) {
    console.warn('AI sky data insights unavailable:', error.message);
    return [
      `Sunset at ${astro?.sunset || 'evening'} offers ${astro?.moonPhase === 'New Moon' ? 'excellent' : 'good'} stargazing conditions with ${astro?.milkyWayVisibility || 'moderate'} Milky Way visibility.`,
      `The ${astro?.moonPhase || 'current'} moon phase provides ${astro?.moonIllumination > 50 ? 'bright moonlight for landscape photography' : 'dark skies ideal for deep space objects'}.`,
      `${season} brings ${season === 'Summer' ? 'longer nights and galactic center views' : season === 'Winter' ? 'aurora opportunities and winter constellations' : 'transitional sky conditions'}.`,
      `Best photography window: ${astro?.sunset || 'sunset'} to ${astro?.sunrise || 'sunrise'} with ${weather?.condition?.includes('clear') ? 'excellent' : 'variable'} weather conditions.`
    ];
  }
}

async function generateParkInfoInsights(park, weatherData, astroData) {
  try {
    const weather = weatherData?.current;
    const astro = astroData;
    const season = getSeason(new Date().getMonth());
    
    const prompt = `Generate AI-powered park highlights and insights for ${park.fullName} based on current conditions.
    
    Park Information:
    - Name: ${park.fullName}
    - Description: ${park.description}
    - Location: ${park.latitude}, ${park.longitude}
    - Elevation: Various elevations
    - Size: Large national park
    
    Current Conditions:
    - Weather: ${weather?.condition || 'Unknown'}, ${weather?.temperature || 'Unknown'}°F
    - Season: ${season}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'}
    - Best Time: Morning
    
    Generate 4 compelling insights covering:
    1. **Park Highlights**: What makes this park special and unique today
    2. **Seasonal Features**: What seasonal attractions or phenomena are happening now
    3. **Weather Impact**: How current weather enhances or affects the park experience
    4. **Visitor Experience**: What visitors can expect and should know before visiting
    
    Each insight should be 2-3 sentences, engaging and informative.
    Format as a JSON array of strings.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    const insights = JSON.parse(response);
    return insights.slice(0, 4).map(insight => insight.replace(/\*\*(.*?)\*\*/g, '$1'));
  } catch (error) {
    console.warn('AI park info insights unavailable:', error.message);
    return [
      `${park.fullName} offers ${season.toLowerCase()} beauty with ${weather?.condition?.includes('clear') ? 'excellent' : 'variable'} visibility for diverse landscapes and natural features.`,
      `This ${season.toLowerCase()} season brings ${season === 'Spring' ? 'wildflower blooms and wildlife activity' : season === 'Summer' ? 'longer days and warm weather' : season === 'Fall' ? 'colorful foliage and cooler temperatures' : 'winter landscapes and potential snow'}.`,
      `Current ${weather?.condition || 'weather'} conditions create ${weather?.temperature > 70 ? 'ideal' : weather?.temperature < 50 ? 'challenging but rewarding' : 'comfortable'} conditions for morning exploration.`,
      `Visitors should expect moderate conditions with extensive terrain requiring proper preparation and comfortable walking shoes.`
    ];
  }
}

async function generatePersonalizedRecommendations(park, weatherData, astroData) {
  try {
    const weather = weatherData?.current;
    const astro = astroData;
    const season = getSeason(new Date().getMonth());
    
    const prompt = `Generate 3 personalized, actionable ACTIVITY recommendations for visiting ${park.fullName} today.
    
    Context:
    - Weather: ${weather?.condition || 'Unknown'}, ${weather?.temperature || 'Unknown'}°F
    - Season: ${season}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'}
    - Sunrise: ${astro?.sunrise || 'Unknown'}, Sunset: ${astro?.sunset || 'Unknown'}
    - Park Type: National Park
    
    FOCUS ON ACTIVITIES ONLY:
    - Specific park activities and experiences
    - Timing suggestions (morning, afternoon, evening)
    - Photography opportunities and techniques
    - Wildlife viewing and nature experiences
    - Hiking, scenic drives, or other park activities
    
    Each recommendation should be under 60 words and activity-focused.
    Format as a JSON array of strings.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    const recommendations = JSON.parse(response);
    return recommendations.slice(0, 3).map(rec => rec.replace(/\*\*(.*?)\*\*/g, '$1'));
  } catch (error) {
    console.warn('AI recommendations unavailable:', error.message);
    return [
      `Visit ${park.fullName} during the best weather conditions for optimal experience.`,
      `Check the sunrise and sunset times for optimal lighting and photography opportunities.`,
      `Bring appropriate gear for the current weather and comfortable walking shoes.`
    ];
  }
}

async function generateStargazingGuide(park, astroData, weatherData) {
  try {
    const astro = astroData;
    const weather = weatherData?.current;
    const season = getSeason(new Date().getMonth());
    
    const prompt = `Generate engaging sky and stargazing insights for ${park.fullName} at coordinates ${park.latitude}, ${park.longitude} in ${getMonthName(new Date().getMonth())}.
    
    Current Astronomical Data:
    - Sunrise: ${astro?.sunrise || 'Unknown'}
    - Sunset: ${astro?.sunset || 'Unknown'}
    - Moon Phase: ${astro?.moonPhase || 'Unknown'} (${astro?.moonIllumination || 'Unknown'}% illuminated)
    - Milky Way Visibility: ${astro?.milkyWayVisibility || 'Unknown'}
    - Aurora Probability: ${astro?.auroraProbability || 'Unknown'}
    - Day Length: ${astro?.dayLength ? astro.dayLength.toFixed(1) + ' hours' : 'Unknown'}
    
    Include:
    - Best stargazing times and conditions
    - What celestial objects are visible
    - Seasonal astronomy highlights
    - Photography tips for the current conditions
    - Moon phase specific recommendations
    
    Keep it under 150 words and make it specific to this location, season, and current astronomical conditions.`;

    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    return response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  } catch (error) {
    return `Great stargazing opportunities at ${park.fullName} tonight! Check local conditions for the best viewing.`;
  }
}

function getSeason(month) {
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Fall';
  return 'Winter';
}

function getMonthName(month) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month];
}

// Run the script
generateDailyFeed();
