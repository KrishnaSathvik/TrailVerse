const express = require('express');
const { fetchGoogleMaps: fetch } = require('../services/googleMapsTransport');
const NodeCache = require('node-cache');
const { safeCacheSet } = require('../utils/safeCacheSet');
const { searchNearbyPlaces } = require('../services/placesLodgingService');

const router = express.Router();
const cache = new NodeCache({
  stdTTL: 60 * 60 * 24 * 3, // 3 days default
  maxKeys: 400,
  checkperiod: 300,
});
const KEY = process.env.GMAPS_SERVER_KEY;

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
    
    safeCacheSet(cache, k, minimal);
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
      console.error('GMAPS_SERVER_KEY not configured in nearby search');
      return res.status(500).json({
        error: 'Google Maps API key not configured',
      });
    }

    const result = await searchNearbyPlaces({
      lat,
      lng,
      type,
      radiusMeters: radius,
      parkName,
      limit: 10,
    });

    if (result.status === 'provider_unavailable') {
      return res.status(400).json({ error: 'Google Places API unavailable' });
    }

    safeCacheSet(cache, k, result.places, 60 * 60 * 24); // 1 day
    res.json(result.places);
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
 *         required: false
 *         schema:
 *           type: string
 *         description: Photo reference (alternative to photo_reference)
 *       - in: query
 *         name: photo_reference
 *         required: false
 *         schema:
 *           type: string
 *         description: Photo reference (alternative to ref)
 *       - in: query
 *         name: w
 *         schema:
 *           type: number
 *           default: 800
 *         description: Width in pixels (alternative to maxwidth)
 *       - in: query
 *         name: maxwidth
 *         schema:
 *           type: number
 *           default: 800
 *         description: Maximum width in pixels (alternative to w)
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
    const { ref, photo_reference, w = 800, maxwidth } = req.query;
    
    // Support both 'ref' and 'photo_reference' parameters for backward compatibility
    const photoRef = ref || photo_reference;
    const width = w || maxwidth || 800;
    
    if (!photoRef) {
      return res.status(400).send('Missing photo reference');
    }

    const k = `photo:${photoRef}:${width}`;
    const hit = cache.get(k);
    
    if (hit) {
      res.set('Cache-Control', 'public, max-age=2592000');
      return res.type('image/jpeg').send(hit);
    }

    const url = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${encodeURIComponent(photoRef)}&maxwidth=${width}&key=${KEY}`;
    const response = await fetch(url, { redirect: 'follow' });
    const buffer = Buffer.from(await response.arrayBuffer());

    safeCacheSet(cache, k, buffer, 60 * 60 * 24 * 30); // 30 days
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

    safeCacheSet(cache, k, buffer, 60 * 60 * 24 * 30); // 30 days
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
            // Use proxy endpoint instead of direct Google API URL
            url: `/api/gmaps/photo?photo_reference=${photo.photo_reference}&maxwidth=400`
          };
        }) || []
      }
    };

    // Cache for 3 days
    safeCacheSet(cache, k, processedData, 60 * 60 * 24 * 3);
    
    console.log('✅ Place details fetched and cached for:', result.name);
    res.json(processedData);
    
  } catch (error) {
    console.error('❌ Place details error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

