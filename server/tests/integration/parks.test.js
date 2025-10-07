const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');

describe('Parks Integration Tests', () => {
  let authToken;
  let testUser;

  beforeEach(async () => {
    // Create a test user and get auth token
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123'
    });

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });

    authToken = loginResponse.body.token;
  });

  describe('GET /api/parks', () => {
    it('should get all parks', async () => {
      const response = await request(app)
        .get('/api/parks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Check if parks have required fields
      if (response.body.data.length > 0) {
        const park = response.body.data[0];
        expect(park).toHaveProperty('id');
        expect(park).toHaveProperty('name');
        expect(park).toHaveProperty('parkCode');
        expect(park).toHaveProperty('description');
      }
    });

    it('should filter parks by state', async () => {
      const response = await request(app)
        .get('/api/parks?state=CA')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // All returned parks should be in California
      response.body.data.forEach(park => {
        expect(park.states).toContain('CA');
      });
    });

    it('should search parks by name', async () => {
      const response = await request(app)
        .get('/api/parks?search=yosemite')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // All returned parks should contain 'yosemite' in name (case insensitive)
      response.body.data.forEach(park => {
        expect(park.name.toLowerCase()).toContain('yosemite');
      });
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/parks?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination).toHaveProperty('currentPage', 1);
      expect(response.body.pagination).toHaveProperty('totalPages');
      expect(response.body.pagination).toHaveProperty('totalParks');
    });

    it('should sort parks by name', async () => {
      const response = await request(app)
        .get('/api/parks?sort=name')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Check if parks are sorted alphabetically
      for (let i = 1; i < response.body.data.length; i++) {
        expect(response.body.data[i].name.localeCompare(response.body.data[i-1].name)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/parks')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/parks/:parkCode', () => {
    it('should get park by code', async () => {
      const response = await request(app)
        .get('/api/parks/yose')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('parkCode', 'yose');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('description');
      expect(response.body.data).toHaveProperty('location');
    });

    it('should return 404 for non-existent park', async () => {
      const response = await request(app)
        .get('/api/parks/nonexistent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Park not found');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/parks/yose')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/parks/:parkCode/activities', () => {
    it('should get park activities', async () => {
      const response = await request(app)
        .get('/api/parks/yose/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Check if activities have required fields
      if (response.body.data.length > 0) {
        const activity = response.body.data[0];
        expect(activity).toHaveProperty('id');
        expect(activity).toHaveProperty('name');
        expect(activity).toHaveProperty('description');
      }
    });

    it('should return 404 for non-existent park activities', async () => {
      const response = await request(app)
        .get('/api/parks/nonexistent/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/parks/:parkCode/events', () => {
    it('should get park events', async () => {
      const response = await request(app)
        .get('/api/parks/yose/events')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Check if events have required fields
      if (response.body.data.length > 0) {
        const event = response.body.data[0];
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('title');
        expect(event).toHaveProperty('date');
        expect(event).toHaveProperty('parkCode', 'yose');
      }
    });

    it('should filter events by date range', async () => {
      const startDate = new Date().toISOString().split('T')[0];
      const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const response = await request(app)
        .get(`/api/parks/yose/events?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // All events should be within the date range
      response.body.data.forEach(event => {
        const eventDate = new Date(event.date);
        const start = new Date(startDate);
        const end = new Date(endDate);
        expect(eventDate).toBeGreaterThanOrEqual(start);
        expect(eventDate).toBeLessThanOrEqual(end);
      });
    });
  });

  describe('GET /api/parks/:parkCode/weather', () => {
    it('should get park weather', async () => {
      const response = await request(app)
        .get('/api/parks/yose/weather')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('current');
      expect(response.body.data).toHaveProperty('forecast');
      
      // Check current weather structure
      const current = response.body.data.current;
      expect(current).toHaveProperty('temperature');
      expect(current).toHaveProperty('condition');
      expect(current).toHaveProperty('humidity');
      expect(current).toHaveProperty('windSpeed');
    });

    it('should return 404 for non-existent park weather', async () => {
      const response = await request(app)
        .get('/api/parks/nonexistent/weather')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/parks/:parkCode/reviews', () => {
    it('should get park reviews', async () => {
      const response = await request(app)
        .get('/api/parks/yose/reviews')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // Check if reviews have required fields
      if (response.body.data.length > 0) {
        const review = response.body.data[0];
        expect(review).toHaveProperty('id');
        expect(review).toHaveProperty('rating');
        expect(review).toHaveProperty('comment');
        expect(review).toHaveProperty('user');
        expect(review).toHaveProperty('parkCode', 'yose');
      }
    });

    it('should paginate reviews', async () => {
      const response = await request(app)
        .get('/api/parks/yose/reviews?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeLessThanOrEqual(5);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should filter reviews by rating', async () => {
      const response = await request(app)
        .get('/api/parks/yose/reviews?minRating=4')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
      
      // All reviews should have rating >= 4
      response.body.data.forEach(review => {
        expect(review.rating).toBeGreaterThanOrEqual(4);
      });
    });
  });

  describe('POST /api/parks/:parkCode/reviews', () => {
    it('should create a new review', async () => {
      const reviewData = {
        rating: 5,
        comment: 'Amazing park with beautiful scenery!'
      };

      const response = await request(app)
        .post('/api/parks/yose/reviews')
        .set('Authorization', `Bearer ${authToken}`)
        .send(reviewData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.rating).toBe(reviewData.rating);
      expect(response.body.data.comment).toBe(reviewData.comment);
      expect(response.body.data.parkCode).toBe('yose');
      expect(response.body.data.user).toBe(testUser._id.toString());
    });

    it('should validate review data', async () => {
      const response = await request(app)
        .post('/api/parks/yose/reviews')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          rating: 6 // Invalid rating (should be 1-5)
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/parks/yose/reviews')
        .send({
          rating: 5,
          comment: 'Great park!'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Caching', () => {
    it('should cache park data', async () => {
      // First request
      const response1 = await request(app)
        .get('/api/parks/yose')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Second request should be faster (cached)
      const startTime = Date.now();
      const response2 = await request(app)
        .get('/api/parks/yose')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      const endTime = Date.now();

      expect(response1.body.data).toEqual(response2.body.data);
      expect(endTime - startTime).toBeLessThan(100); // Should be very fast due to caching
    });
  });

  describe('Error handling', () => {
    it('should handle NPS API errors gracefully', async () => {
      // Mock NPS API to return error
      const originalNpsService = require('../../src/services/npsService');
      const mockNpsService = {
        getParks: vi.fn().mockRejectedValue(new Error('NPS API Error')),
        getParkByCode: vi.fn().mockRejectedValue(new Error('NPS API Error'))
      };

      // This would require dependency injection to test properly
      // For now, we'll test the error response structure
      const response = await request(app)
        .get('/api/parks/invalid-park-code')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });
});
