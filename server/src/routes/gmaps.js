const express = require('express');
const fetch = require('node-fetch');
const NodeCache = require('node-cache');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 60 * 60 * 24 * 3 }); // 3 days default
const KEY = process.env.GMAPS_SERVER_KEY;

// Debug endpoint to check API key status
router.get('/debug', (req, res) => {
  res.json({
    hasKey: !!KEY,
    keyLength: KEY ? KEY.length : 0,
    keyPrefix: KEY ? KEY.substring(0, 10) + '...' : 'none',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    allEnvVars: Object.keys(process.env).filter(key => key.includes('GMAPS') || key.includes('GOOGLE'))
  });
});

// Debug endpoint to test Google Places API directly
router.get('/debug-places', async (req, res) => {
  try {
    if (!KEY) {
      return res.status(500).json({ error: 'GMAPS_SERVER_KEY not configured' });
    }

    const { lat = '40.7128', lng = '-74.0060', type = 'restaurant', radius = '1000' } = req.query;
    
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${KEY}`;
    
    console.log('🔍 Testing Google Places API directly:', url);
    
    const response = await fetch(url);
    const json = await response.json();
    
    res.json({
      url,
      status: json.status,
      error_message: json.error_message,
      results: json.results?.length || 0,
      raw_response: json
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/gmaps/place/{placeId}:
 *   get:
 *     summary: Get Place Details from Google Maps
 *     tags: [Google Maps]
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Place details retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/place/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const k = `pd:${placeId}`;
    const hit = cache.get(k);
    
    if (hit) {
      return res.json(hit);
    }

    if (!KEY) {
      console.error('❌ GMAPS_SERVER_KEY not configured');
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    const fields = [
      'place_id', 'name', 'formatted_address', 'geometry/location',
      'rating', 'user_ratings_total', 'opening_hours/weekday_text', 'photos', 'website'
    ].join(',');
    
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${encodeURIComponent(fields)}&key=${KEY}`;
    const response = await fetch(url);
    const json = await response.json();
    
    console.log('Google Maps API response status:', json.status);
    if (json.status !== 'OK') {
      console.error('Google Maps API error:', json);
      return res.status(500).json({ error: `Google Maps API error: ${json.status}` });
    }
    
    const r = json.result || {};
    const minimal = {
      place_id: r.place_id,
      name: r.name,
      address: r.formatted_address,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
      rating: r.rating,
      user_ratings_total: r.user_ratings_total,
      opening_hours: r.opening_hours?.weekday_text || [],
      photo_refs: (r.photos || []).slice(0, 4).map(p => p.photo_reference),
      website: r.website || null
    };
    
    cache.set(k, minimal);
    res.json(minimal);
  } catch (error) {
    console.error('Place Details Error:', error);
    res.status(500).json({ error: 'Failed to fetch place details' });
  }
});

/**
 * @swagger
 * /api/gmaps/nearby:
 *   get:
 *     summary: Get Nearby Places (Food/Gas/Lodging)
 *     tags: [Google Maps]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [restaurant, gas_station, lodging]
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 10000
 *     responses:
 *       200:
 *         description: Nearby places retrieved successfully
 *       400:
 *         description: Missing required parameters
 *       500:
 *         description: Server error
 */
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, type, radius = 10000, parkName } = req.query;
    console.log('🔍 Nearby search params:', { lat, lng, type, radius, parkName });
    
    if (!lat || !lng || !type) {
      console.log('❌ Missing required params:', { lat, lng, type });
      return res.status(400).json({ error: 'lat, lng, and type are required' });
    }

    const k = `nb:${lat},${lng},${type},${radius}${parkName ? `,${parkName}` : ''}`;
    const hit = cache.get(k);
    
    if (hit) {
      return res.json(hit);
    }

    if (!KEY) {
      console.error('❌ GMAPS_SERVER_KEY not configured in nearby search');
      console.error('❌ Environment variables:', Object.keys(process.env).filter(key => key.includes('GMAPS')));
      console.error('❌ All environment variables:', Object.keys(process.env).sort());
      return res.status(500).json({ 
        error: 'Google Maps API key not configured',
        debug: {
          hasKey: !!KEY,
          keyLength: KEY ? KEY.length : 0,
          environment: process.env.NODE_ENV,
          availableEnvVars: Object.keys(process.env).filter(key => key.includes('GMAPS'))
        }
      });
    }

    let url;
    
    // Handle park-specific attractions search
    if (type === 'tourist_attraction_park_specific' && parkName) {
      // Use text search for park-specific attractions
      const searchQuery = `${parkName} attractions landmarks points of interest`;
      url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&location=${lat},${lng}&radius=${radius}&key=${KEY}`;
      console.log('🔍 Park-specific search query:', searchQuery);
    } else {
      // Regular nearby search
      const searchType = type === 'tourist_attraction_park_specific' ? 'tourist_attraction' : type;
      url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${encodeURIComponent(searchType)}&key=${KEY}`;
    }
    
    console.log('🔍 Google Places API URL:', url);
    const response = await fetch(url);
    const json = await response.json();
    
    console.log('🔍 Google Places API Response:', {
      status: json.status,
      resultsCount: json.results?.length || 0,
      error_message: json.error_message
    });
    
    // Check for API errors
    if (json.status !== 'OK') {
      console.error('❌ Google Places API Error:', json.status, json.error_message);
      console.error('❌ Request URL:', url);
      console.error('❌ Full API Response:', JSON.stringify(json, null, 2));
      
      // Handle specific error cases
      if (json.status === 'REQUEST_DENIED') {
        return res.status(400).json({ 
          error: 'Google Places API access denied. Check API key and billing.',
          status: json.status, 
          message: json.error_message,
          debug: {
            hasKey: !!KEY,
            keyLength: KEY ? KEY.length : 0,
            url: url.replace(KEY, 'HIDDEN_KEY')
          }
        });
      }
      
      if (json.status === 'INVALID_REQUEST') {
        return res.status(400).json({ 
          error: 'Invalid request to Google Places API',
          status: json.status, 
          message: json.error_message,
          debug: {
            url: url.replace(KEY, 'HIDDEN_KEY'),
            params: { lat, lng, type, radius, parkName }
          }
        });
      }
      
      return res.status(400).json({ 
        error: 'Google Places API error', 
        status: json.status, 
        message: json.error_message,
        debug: {
          url: url.replace(KEY, 'HIDDEN_KEY'),
          params: { lat, lng, type, radius, parkName }
        }
      });
    }
    
    // Debug: Check first result's rating data
    if (json.results && json.results.length > 0) {
      const firstResult = json.results[0];
      console.log('🔍 Sample result rating data:', {
        name: firstResult.name,
        rating: firstResult.rating,
        user_ratings_total: firstResult.user_ratings_total,
        price_level: firstResult.price_level
      });
    }
    
    // Check if we have results
    if (!json.results || json.results.length === 0) {
      console.log('🔍 No results found for search:', { lat, lng, type, radius });
      return res.json([]);
    }
    
    // Fetch detailed place information for each result to get photos and complete data
    const items = [];
    const placesToProcess = json.results.slice(0, 50); // Get more results to find top 10 by rating
    
    for (const place of placesToProcess) {
      try {
        // Fetch place details to get photos and complete information
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,geometry/location,rating,user_ratings_total,price_level,photos,opening_hours/weekday_text,website,formatted_phone_number,types,vicinity&key=${KEY}`;
        const detailsResponse = await fetch(detailsUrl);
        const detailsJson = await detailsResponse.json();
        
        if (detailsJson.status === 'OK' && detailsJson.result) {
          const result = detailsJson.result;
          items.push({
            place_id: result.place_id,
            name: result.name,
            lat: result.geometry?.location?.lat,
            lng: result.geometry?.location?.lng,
            rating: result.rating,
            user_ratings_total: result.user_ratings_total,
            price_level: result.price_level,
            address: result.vicinity || result.formatted_address,
            formatted_address: result.formatted_address,
            photos: result.photos?.map(photo => ({
              photo_reference: photo.photo_reference,
              url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${KEY}`
            })) || [],
            opening_hours: result.opening_hours ? {
              weekday_text: result.opening_hours.weekday_text,
              open_now: result.opening_hours.open_now
            } : null,
            website: result.website,
            formatted_phone_number: result.formatted_phone_number,
            phone_number: result.formatted_phone_number,
            types: result.types,
            vicinity: result.vicinity
          });
        } else {
          // Fallback to basic nearby search data if details fail
          items.push({
            place_id: place.place_id,
            name: place.name,
            lat: place.geometry?.location?.lat,
            lng: place.geometry?.location?.lng,
            rating: place.rating,
            user_ratings_total: place.user_ratings_total || null,
            address: place.vicinity || place.formatted_address
          });
        }
      } catch (error) {
        console.error('Error fetching place details for:', place.name, error);
        // Fallback to basic nearby search data
        items.push({
          place_id: place.place_id,
          name: place.name,
          lat: place.geometry?.location?.lat,
          lng: place.geometry?.location?.lng,
          rating: place.rating,
          user_ratings_total: place.user_ratings_total || null,
          address: place.vicinity || place.formatted_address
        });
      }
    }
    
    console.log('🔍 Processed items with ratings:', items.slice(0, 3).map(item => ({
      name: item.name,
      rating: item.rating,
      user_ratings_total: item.user_ratings_total
    })));
    
    // Sort by rating (highest first), then by number of reviews (most reviews first)
    const sortedItems = items.sort((a, b) => {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      const reviewsA = a.user_ratings_total || 0;
      const reviewsB = b.user_ratings_total || 0;
      
      // First sort by rating (descending)
      if (ratingB !== ratingA) {
        return ratingB - ratingA;
      }
      // If ratings are equal, sort by number of reviews (descending)
      return reviewsB - reviewsA;
    });
    
    // Take top 10 best places
    const top10 = sortedItems.slice(0, 10);
    
    console.log('🔍 Top 10 places by rating:', top10.map(item => ({
      name: item.name,
      rating: item.rating,
      user_ratings_total: item.user_ratings_total
    })));
    
    cache.set(k, top10, 60 * 60 * 24); // 1 day
    res.json(top10);
  } catch (error) {
    console.error('Nearby Search Error:', error);
    res.status(500).json({ error: 'Failed to fetch nearby places' });
  }
});

/**
 * @swagger
 * /api/gmaps/photo:
 *   get:
 *     summary: Proxy Google Place Photos
 *     tags: [Google Maps]
 *     parameters:
 *       - in: query
 *         name: ref
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: w
 *         schema:
 *           type: number
 *           default: 800
 *     responses:
 *       200:
 *         description: Photo retrieved successfully
 *       400:
 *         description: Missing photo reference
 *       500:
 *         description: Server error
 */
router.get('/photo', async (req, res) => {
  try {
    const { ref, w = 800 } = req.query;
    
    if (!ref) {
      return res.status(400).send('Missing photo reference');
    }

    const k = `photo:${ref}:${w}`;
    const hit = cache.get(k);
    
    if (hit) {
      res.set('Cache-Control', 'public, max-age=2592000');
      return res.type('image/jpeg').send(hit);
    }

    const url = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${encodeURIComponent(ref)}&maxwidth=${w}&key=${KEY}`;
    const response = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await response.arrayBuffer());

    cache.set(k, buffer, 60 * 60 * 24 * 30); // 30 days
    res.set('Cache-Control', 'public, max-age=2592000');
    res.type('image/jpeg').send(buffer);
  } catch (error) {
    console.error('Photo Proxy Error:', error);
    res.status(500).send('Photo fetch failed');
  }
});

/**
 * @swagger
 * /api/gmaps/static:
 *   get:
 *     summary: Get Static Map Image (Fallback)
 *     tags: [Google Maps]
 *     parameters:
 *       - in: query
 *         name: center
 *         schema:
 *           type: string
 *           default: "39.5,-98.35"
 *       - in: query
 *         name: zoom
 *         schema:
 *           type: number
 *           default: 4
 *       - in: query
 *         name: w
 *         schema:
 *           type: number
 *           default: 800
 *       - in: query
 *         name: h
 *         schema:
 *           type: number
 *           default: 500
 *       - in: query
 *         name: markers
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Static map image retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/static', async (req, res) => {
  try {
    const { center = '39.5,-98.35', zoom = 4, w = 800, h = 500, markers } = req.query;
    const k = `static:${center}:${zoom}:${w}x${h}:${markers || ''}`;
    const hit = cache.get(k);
    
    if (hit) {
      res.set('Cache-Control', 'public, max-age=2592000');
      return res.type('image/png').send(hit);
    }

    const base = 'https://maps.googleapis.com/maps/api/staticmap';
    const params = new URLSearchParams({
      center: String(center),
      zoom: String(zoom),
      size: `${w}x${h}`,
      key: KEY
    });
    
    if (markers) {
      params.append('markers', markers);
    }

    const url = `${base}?${params.toString()}`;
    const response = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await response.arrayBuffer());

    cache.set(k, buffer, 60 * 60 * 24 * 30); // 30 days
    res.set('Cache-Control', 'public, max-age=2592000');
    res.type('image/png').send(buffer);
  } catch (error) {
    console.error('Static Map Error:', error);
    res.status(500).send('Static map fetch failed');
  }
});

/**
 * @swagger
 * /api/gmaps/placedetails:
 *   get:
 *     summary: Get detailed place information from Google Maps
 *     tags: [Google Maps]
 *     parameters:
 *       - in: query
 *         name: place_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Place details retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/placedetails', async (req, res) => {
  try {
    const { place_id } = req.query;
    
    if (!place_id) {
      return res.status(400).json({ error: 'place_id is required' });
    }

    const k = `pd:${place_id}`;
    const hit = cache.get(k);
    
    if (hit) {
      console.log('✅ Place details cache hit for:', place_id);
      return res.json(hit);
    }

    if (!KEY) {
      console.error('❌ GMAPS_SERVER_KEY not configured');
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    // Request comprehensive place details
    const fields = [
      'place_id', 'name', 'formatted_address', 'geometry/location',
      'rating', 'user_ratings_total', 'price_level', 'opening_hours/weekday_text', 
      'photos', 'website', 'formatted_phone_number', 'types', 'vicinity'
    ].join(',');
    
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${encodeURIComponent(fields)}&key=${KEY}`;
    
    console.log('🔍 Fetching place details for:', place_id);
    const response = await fetch(url);
    const json = await response.json();
    
    if (json.status !== 'OK') {
      console.error('❌ Google Places API error:', json.status, json.error_message);
      return res.status(400).json({ 
        error: 'Failed to fetch place details', 
        status: json.status,
        message: json.error_message 
      });
    }

    const result = json.result;
    const processedData = {
      success: true,
      result: {
        place_id: result.place_id,
        name: result.name,
        formatted_address: result.formatted_address,
        address: result.vicinity || result.formatted_address,
        lat: result.geometry?.location?.lat,
        lng: result.geometry?.location?.lng,
        rating: result.rating,
        user_ratings_total: result.user_ratings_total,
        price_level: result.price_level,
        opening_hours: result.opening_hours?.weekday_text,
        website: result.website,
        phone_number: result.formatted_phone_number,
        types: result.types,
        photos: result.photos?.map(photo => {
          // Return photo reference for frontend to construct URL
          return {
            photo_reference: photo.photo_reference,
            width: photo.width,
            height: photo.height,
            // Construct the photo URL
            url: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${KEY}`
          };
        }) || []
      }
    };

    // Cache for 3 days
    cache.set(k, processedData, 60 * 60 * 24 * 3);
    
    console.log('✅ Place details fetched and cached for:', result.name);
    res.json(processedData);
    
  } catch (error) {
    console.error('❌ Place details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

