#!/usr/bin/env node

/**
 * Google Maps API Diagnostic Script
 * Helps identify issues with Google Maps API configuration
 */

const fetch = require('node-fetch');

async function diagnoseGoogleMapsAPI() {
  console.log('🔍 Google Maps API Diagnostic Tool');
  console.log('=====================================\n');

  // Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`GMAPS_SERVER_KEY: ${process.env.GMAPS_SERVER_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`PORT: ${process.env.PORT}`);
  
  if (process.env.GMAPS_SERVER_KEY) {
    console.log(`Key length: ${process.env.GMAPS_SERVER_KEY.length} characters`);
    console.log(`Key prefix: ${process.env.GMAPS_SERVER_KEY.substring(0, 10)}...`);
  }

  console.log('\n🔍 Testing Google Places API...');

  if (!process.env.GMAPS_SERVER_KEY) {
    console.log('❌ No API key found. Please set GMAPS_SERVER_KEY environment variable.');
    console.log('\n💡 To fix this:');
    console.log('1. Go to Google Cloud Console (https://console.cloud.google.com/)');
    console.log('2. Create a new project or select existing one');
    console.log('3. Enable Places API');
    console.log('4. Create credentials (API Key)');
    console.log('5. Set GMAPS_SERVER_KEY in your environment');
    return;
  }

  try {
    // Test with a simple request
    const testUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=40.7128,-74.0060&radius=1000&type=restaurant&key=${process.env.GMAPS_SERVER_KEY}`;
    
    console.log('🌐 Making test request to Google Places API...');
    const response = await fetch(testUrl);
    const data = await response.json();

    console.log('\n📊 API Response:');
    console.log(`Status: ${data.status}`);
    console.log(`Results: ${data.results?.length || 0}`);
    
    if (data.error_message) {
      console.log(`Error: ${data.error_message}`);
    }

    // Analyze the response
    if (data.status === 'OK') {
      console.log('\n✅ Google Maps API is working correctly!');
      console.log(`Found ${data.results.length} restaurants near NYC`);
    } else if (data.status === 'REQUEST_DENIED') {
      console.log('\n❌ API Access Denied');
      console.log('Possible causes:');
      console.log('1. API key is invalid or expired');
      console.log('2. Places API is not enabled for this key');
      console.log('3. Billing is not enabled on the Google Cloud project');
      console.log('4. API key has restrictions that prevent server-side usage');
      
      console.log('\n💡 To fix this:');
      console.log('1. Check Google Cloud Console > APIs & Services > Credentials');
      console.log('2. Ensure Places API is enabled');
      console.log('3. Enable billing for the project');
      console.log('4. Check API key restrictions (should allow server-side usage)');
    } else if (data.status === 'INVALID_REQUEST') {
      console.log('\n❌ Invalid Request');
      console.log('The request format is incorrect.');
    } else if (data.status === 'OVER_QUERY_LIMIT') {
      console.log('\n❌ Quota Exceeded');
      console.log('You have exceeded your API quota.');
    } else if (data.status === 'ZERO_RESULTS') {
      console.log('\n⚠️  No Results Found');
      console.log('The API is working but no results were found for the test query.');
    } else {
      console.log(`\n❌ Unknown Error: ${data.status}`);
      if (data.error_message) {
        console.log(`Error message: ${data.error_message}`);
      }
    }

  } catch (error) {
    console.log('\n❌ Network Error:');
    console.log(error.message);
    console.log('\n💡 Check your internet connection and try again.');
  }

  console.log('\n📚 Additional Resources:');
  console.log('- Google Places API Documentation: https://developers.google.com/maps/documentation/places/web-service');
  console.log('- Google Cloud Console: https://console.cloud.google.com/');
  console.log('- API Key Best Practices: https://developers.google.com/maps/api-key-best-practices');
}

// Run the diagnostic
diagnoseGoogleMapsAPI().catch(console.error);
