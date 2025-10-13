import api from './enhancedApi';

/**
 * Google Places Service
 * Provides methods to interact with Google Maps APIs via our backend proxy
 */
export const googlePlacesService = {
  /**
   * Get place details by place ID
   * @param {string} placeId - Google Place ID
   * @returns {Promise<Object>} Place details
   */
  getDetails: async (placeId) => {
    const { data } = await api.get(`/gmaps/place/${placeId}`);
    return data;
  },

  /**
   * Get nearby places (essentials)
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} type - Place type ('restaurant', 'gas_station', 'lodging', 'tourist_attraction_park_specific')
   * @param {number} radius - Search radius in meters (default 10000)
   * @param {string} parkName - Park name for park-specific searches (optional)
   * @returns {Promise<Array>} Nearby places
   */
  getNearby: async (lat, lng, type, radius = 10000, parkName = null) => {
    let url = `/gmaps/nearby?lat=${lat}&lng=${lng}&type=${type}&radius=${radius}`;
    if (parkName) {
      url += `&parkName=${encodeURIComponent(parkName)}`;
    }
    const { data } = await api.get(url);
    return data;
  },

  /**
   * Get photo URL (proxied)
   * @param {string} ref - Photo reference
   * @param {number} w - Width in pixels
   * @returns {string} Photo URL
   */
  photoUrl: (ref, w = 800) => {
    return `/api/gmaps/photo?ref=${encodeURIComponent(ref)}&w=${w}`;
  },

  /**
   * Get static map URL (fallback)
   * @param {Object} options - Map options
   * @returns {string} Static map URL
   */
  staticMapUrl: (options = {}) => {
    const { center, zoom = 4, w = 800, h = 500, markers } = options;
    const params = new URLSearchParams({
      center: center || '39.5,-98.35',
      zoom: String(zoom),
      w: String(w),
      h: String(h)
    });
    if (markers) {
      params.append('markers', markers);
    }
    return `/api/gmaps/static?${params.toString()}`;
  }
};

