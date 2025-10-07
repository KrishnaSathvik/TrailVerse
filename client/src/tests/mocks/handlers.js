import { http, HttpResponse } from 'msw';

// Mock API responses
export const handlers = [
  // Auth endpoints
  http.post('/api/auth/signup', () => {
    return HttpResponse.json({
      success: true,
      message: 'Account created! Please check your email to verify your account.',
      data: {
        id: '507f1f77bcf86cd799439011',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
        isEmailVerified: false
      }
    });
  }),

  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user'
      },
      token: 'mock-jwt-token'
    });
  }),

  http.get('/api/auth/me', () => {
    return HttpResponse.json({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        name: 'Test User',
        email: 'test@example.com',
        role: 'user',
        isEmailVerified: true
      }
    });
  }),

  // Parks endpoints
  http.get('/api/parks', () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: 'acad',
          name: 'Acadia National Park',
          parkCode: 'acad',
          description: 'Test park description',
          location: 'Maine',
          coordinates: { latitude: 44.35, longitude: -68.21 }
        }
      ]
    });
  }),

  http.get('/api/parks/:parkCode', ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: {
        id: params.parkCode,
        name: 'Test National Park',
        parkCode: params.parkCode,
        description: 'Test park description',
        location: 'Test State',
        coordinates: { latitude: 44.35, longitude: -68.21 },
        activities: ['Hiking', 'Camping'],
        amenities: ['Visitor Center', 'Campground']
      }
    });
  }),

  // Events endpoints
  http.get('/api/events', () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: '507f1f77bcf86cd799439011',
          title: 'Test Event',
          description: 'Test event description',
          date: '2024-12-01',
          location: 'Test Location',
          parkCode: 'acad'
        }
      ]
    });
  }),

  // Blog endpoints
  http.get('/api/blogs', () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          id: '507f1f77bcf86cd799439011',
          title: 'Test Blog Post',
          slug: 'test-blog-post',
          content: 'Test blog content',
          excerpt: 'Test excerpt',
          publishedAt: '2024-01-01',
          author: 'Test Author'
        }
      ]
    });
  }),

  http.get('/api/blogs/:slug', ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: {
        id: '507f1f77bcf86cd799439011',
        title: 'Test Blog Post',
        slug: params.slug,
        content: 'Test blog content',
        excerpt: 'Test excerpt',
        publishedAt: '2024-01-01',
        author: 'Test Author'
      }
    });
  }),

  // NPS API mock
  http.get('https://developer.nps.gov/api/v1/parks', () => {
    return HttpResponse.json({
      data: [
        {
          id: 'acad',
          fullName: 'Acadia National Park',
          parkCode: 'acad',
          description: 'Test park description',
          states: 'ME',
          latLong: 'lat:44.35, long:-68.21'
        }
      ]
    });
  }),

  // Weather API mock
  http.get('https://api.openweathermap.org/data/2.5/weather', () => {
    return HttpResponse.json({
      weather: [
        {
          main: 'Clear',
          description: 'clear sky',
          icon: '01d'
        }
      ],
      main: {
        temp: 293.15,
        feels_like: 293.15,
        humidity: 50
      },
      wind: {
        speed: 3.5
      }
    });
  })
];
