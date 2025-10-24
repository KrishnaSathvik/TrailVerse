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

    console.log('🚀 Generating NEW Daily Feed with Fixed Astronomical Data...');
    console.log(`👤 User: devteam`);
    console.log(`📅 Date: ${today}`);

    // Get a National Park (using fallback for testing)
    console.log('\n🏞️ Getting National Park...');
    
    // Use a known National Park for testing
    const park = {
      parkCode: 'yell',
      fullName: 'Yellowstone National Park',
      description: 'Yellowstone National Park is a nearly 3,350-sq.-mile wilderness recreation area atop a volcanic hot spot. Mostly in Wyoming, the park spreads into parts of Montana and Idaho too. It features dramatic canyons, alpine rivers, lush forests, hot springs and gushing geysers, including its most famous, Old Faithful.',
      images: [{ url: 'https://www.nps.gov/common/uploads/structured_data/3C7B45AE-1DD8-B71B-0B7B4A1EF16A36C0.jpg' }],
      latitude: '44.4280',
      longitude: '-110.5885',
      designation: 'National Park'
    };
    
    console.log(`  Selected National Park: ${park.fullName} (${park.parkCode})`);

    // Get weather data
    console.log('\n🌤️ Getting weather data...');
    const weatherData = await enhancedParkService.getWeatherData(park);
    console.log(`  Weather: ${weatherData.current.temp}°F, ${weatherData.current.condition}`);

    // Get astronomical data using the new reliable service
    console.log('\n🌙 Getting astronomical data (FIXED)...');
    const astroData = await reliableAstronomicalService.getAstronomicalData(
      parseFloat(park.latitude), 
      parseFloat(park.longitude), 
      new Date(), 
      0
    );
    console.log(`  Sunrise: ${astroData.sunrise}`);
    console.log(`  Sunset: ${astroData.sunset}`);
    console.log(`  Moon Phase: ${astroData.moonPhase}`);

    // Generate AI content
    console.log('\n🤖 Generating AI content...');
    const natureFact = await generateNatureFact(park.parkCode);
    const skyInsights = await generateSkyInsights(park.name, astroData);
    const recommendations = await generateRecommendations(park.name, weatherData, astroData);

    // Create the daily feed
    const dailyFeed = new DailyFeed({
      userId,
      date: today,
      parkOfDay: {
        parkCode: park.parkCode,
        name: park.fullName,
        description: park.description,
        image: park.images && park.images[0] ? park.images[0].url : '/background1.png',
        latitude: park.latitude,
        longitude: park.longitude,
        crowdLevel: 'Moderate',
        bestTime: 'Morning',
        weather: {
          temp: weatherData.current.temp,
          condition: weatherData.current.condition,
          icon: weatherData.current.icon || '02d'
        }
      },
      weatherData: {
        current: {
          temp: weatherData.current.temp,
          temperature: weatherData.current.temperature,
          condition: weatherData.current.condition,
          humidity: weatherData.current.humidity,
          windSpeed: weatherData.current.windSpeed,
          feelsLike: weatherData.current.feelsLike,
          uvIndex: weatherData.current.uvIndex || 0,
          visibility: weatherData.current.visibility || 10
        },
        recommendation: getWeatherRecommendation(weatherData.current.condition, weatherData.current.temperature || weatherData.current.temp)
      },
      astroData: {
        sunrise: astroData.sunrise,
        sunset: astroData.sunset,
        moonPhase: astroData.moonPhase,
        moonIllumination: astroData.moonIllumination,
        moonAge: astroData.moonAge,
        nextNewMoon: astroData.nextNewMoon,
        nextFullMoon: astroData.nextFullMoon,
        milkyWayVisibility: astroData.milkyWayVisibility,
        auroraProbability: astroData.auroraProbability,
        skyInsights,
        dayLength: astroData.dayLength,
        isPolarDay: astroData.isPolarDay,
        isPolarNight: astroData.isPolarNight
      },
      natureFact,
      personalizedRecommendations: recommendations,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    });

    await dailyFeed.save();
    console.log('\n✅ Daily Feed Generated Successfully!');
    console.log('\n📊 Summary:');
    console.log(`  🏞️ National Park: ${park.fullName} (${park.parkCode})`);
    console.log(`  🌤️ Weather: ${weatherData.current.temp}°F, ${weatherData.current.condition}`);
    console.log(`  🌅 Sunrise: ${astroData.sunrise}`);
    console.log(`  🌇 Sunset: ${astroData.sunset}`);
    console.log(`  🌙 Moon: ${astroData.moonPhase} (${astroData.moonIllumination}%)`);
    console.log(`  ⭐ Milky Way: ${astroData.milkyWayVisibility}`);
    console.log(`  🌿 Nature Fact: ${natureFact.substring(0, 50)}...`);
    console.log(`  💡 Recommendations: ${recommendations.length} tips`);

  } catch (error) {
    console.error('❌ Error generating daily feed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Helper functions
async function generateNatureFact(parkCode) {
  try {
    const response = await openaiService.chat([
      { role: 'user', content: `Generate an interesting nature fact about ${parkCode} national park. Keep it under 100 words and make it educational.` }
    ]);
    return response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  } catch (error) {
    return `${parkCode} is a beautiful national park with unique natural features and wildlife.`;
  }
}

async function generateSkyInsights(parkName, astroData) {
  try {
    const prompt = `Generate engaging sky and stargazing insights for ${parkName}. Current conditions: Sunrise ${astroData.sunrise}, Sunset ${astroData.sunset}, Moon Phase ${astroData.moonPhase} (${astroData.moonIllumination}% illuminated), Milky Way Visibility ${astroData.milkyWayVisibility}. Keep it under 150 words and make it specific to this location and current conditions.`;
    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    return response.trim().replace(/\*\*(.*?)\*\*/g, '$1');
  } catch (error) {
    return `Great stargazing opportunities at ${parkName} tonight! Check local conditions for the best viewing.`;
  }
}

async function generateRecommendations(parkName, weatherData, astroData) {
  try {
    const prompt = `Generate 3 personalized recommendations for visiting ${parkName} today. Weather: ${weatherData.current.temp}°F, ${weatherData.current.condition}. Sky: Sunrise ${astroData.sunrise}, Sunset ${astroData.sunset}, Moon ${astroData.moonPhase}. Make each recommendation specific and actionable. Return as a JSON array of strings.`;
    const response = await openaiService.chat([{ role: 'user', content: prompt }]);
    return JSON.parse(response);
  } catch (error) {
    return [
      `Visit ${parkName} during the best weather conditions`,
      `Check the sunrise and sunset times for optimal lighting`,
      `Bring appropriate gear for the current weather`
    ];
  }
}

function getWeatherRecommendation(condition, temperature) {
  const temp = temperature || 70;
  if (temp < 40) return 'Bundle up! Cold weather ahead.';
  if (temp > 85) return 'Stay hydrated and seek shade.';
  if (condition.toLowerCase().includes('rain')) return 'Pack rain gear and waterproof items.';
  if (condition.toLowerCase().includes('sunny')) return 'Perfect weather for outdoor activities!';
  return 'Great day for outdoor adventures!';
}

// Run the script
generateDailyFeed();
