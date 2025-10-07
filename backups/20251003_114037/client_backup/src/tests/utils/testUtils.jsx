import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../context/ThemeContext';
import { AuthProvider } from '../../context/AuthContext';
import { ToastProvider } from '../../context/ToastContext';

// Create a custom render function that includes providers
const AllTheProviders = ({ children, initialAuthState = null }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider initialAuthState={initialAuthState}>
            <ToastProvider>
              {children}
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

const customRender = (ui, options = {}) => {
  const { initialAuthState, ...renderOptions } = options;
  
  return render(ui, {
    wrapper: (props) => <AllTheProviders {...props} initialAuthState={initialAuthState} />,
    ...renderOptions,
  });
};

// Mock user data for testing
export const mockUser = {
  id: '507f1f77bcf86cd799439011',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  isEmailVerified: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

export const mockAdminUser = {
  ...mockUser,
  role: 'admin'
};

// Mock park data for testing
export const mockPark = {
  id: 'yose',
  name: 'Yosemite National Park',
  parkCode: 'yose',
  description: 'Yosemite National Park is in California\'s Sierra Nevada mountains.',
  location: 'California',
  coordinates: { latitude: 37.8651, longitude: -119.5383 },
  states: 'CA',
  activities: ['Hiking', 'Camping', 'Rock Climbing'],
  amenities: ['Visitor Center', 'Campground', 'Restaurant']
};

export const mockParks = [
  mockPark,
  {
    id: 'acad',
    name: 'Acadia National Park',
    parkCode: 'acad',
    description: 'Acadia National Park is a 47,000-acre recreation area.',
    location: 'Maine',
    coordinates: { latitude: 44.35, longitude: -68.21 },
    states: 'ME',
    activities: ['Hiking', 'Biking', 'Kayaking'],
    amenities: ['Visitor Center', 'Campground']
  }
];

// Mock event data for testing
export const mockEvent = {
  id: '507f1f77bcf86cd799439011',
  title: 'Ranger Talk: Wildlife',
  description: 'Join a park ranger for an informative talk about local wildlife.',
  date: '2024-12-01T10:00:00.000Z',
  location: 'Visitor Center',
  parkCode: 'yose',
  category: 'Educational',
  duration: 60
};

// Mock review data for testing
export const mockReview = {
  id: '507f1f77bcf86cd799439011',
  rating: 5,
  comment: 'Amazing park with beautiful scenery!',
  parkCode: 'yose',
  user: {
    id: '507f1f77bcf86cd799439012',
    name: 'John Doe'
  },
  createdAt: '2024-01-01T00:00:00.000Z'
};

// Mock blog post data for testing
export const mockBlogPost = {
  id: '507f1f77bcf86cd799439011',
  title: 'Best Hiking Trails in Yosemite',
  slug: 'best-hiking-trails-yosemite',
  content: 'Yosemite National Park offers some of the most spectacular hiking trails...',
  excerpt: 'Discover the best hiking trails in Yosemite National Park.',
  publishedAt: '2024-01-01T00:00:00.000Z',
  author: 'Jane Smith',
  tags: ['hiking', 'yosemite', 'trails'],
  featuredImage: '/images/yosemite-trail.jpg'
};

// Helper function to create authenticated render
export const renderWithAuth = (ui, user = mockUser, options = {}) => {
  return customRender(ui, {
    initialAuthState: {
      user,
      loading: false,
      error: null
    },
    ...options
  });
};

// Helper function to create unauthenticated render
export const renderWithoutAuth = (ui, options = {}) => {
  return customRender(ui, {
    initialAuthState: {
      user: null,
      loading: false,
      error: null
    },
    ...options
  });
};

// Helper function to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Helper function to mock API responses
export const mockApiResponse = (data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config: {}
});

// Helper function to mock API errors
export const mockApiError = (message, status = 500) => {
  const error = new Error(message);
  error.response = {
    data: { error: message },
    status,
    statusText: 'Error'
  };
  return error;
};

// Helper function to create mock localStorage
export const createMockLocalStorage = () => {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(key => delete store[key]); })
  };
};

// Helper function to create mock sessionStorage
export const createMockSessionStorage = () => {
  const store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(key => delete store[key]); })
  };
};

// Helper function to mock window.location
export const mockWindowLocation = (url) => {
  delete window.location;
  window.location = new URL(url);
};

// Helper function to mock IntersectionObserver
export const mockIntersectionObserver = () => {
  const mockIntersectionObserver = vi.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
  });
  window.IntersectionObserver = mockIntersectionObserver;
  return mockIntersectionObserver;
};

// Helper function to mock ResizeObserver
export const mockResizeObserver = () => {
  const mockResizeObserver = vi.fn();
  mockResizeObserver.mockReturnValue({
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
  });
  window.ResizeObserver = mockResizeObserver;
  return mockResizeObserver;
};

// Helper function to create mock fetch
export const createMockFetch = (responses = {}) => {
  const mockFetch = vi.fn((url, options) => {
    const response = responses[url] || responses['*'] || { data: {}, status: 200 };
    
    return Promise.resolve({
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: () => Promise.resolve(response.data),
      text: () => Promise.resolve(JSON.stringify(response.data))
    });
  });
  
  global.fetch = mockFetch;
  return mockFetch;
};

// Helper function to create mock axios
export const createMockAxios = (responses = {}) => {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(() => mockAxios),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  };

  // Set up default responses
  Object.keys(responses).forEach(method => {
    if (typeof responses[method] === 'function') {
      mockAxios[method] = responses[method];
    } else {
      mockAxios[method].mockResolvedValue(responses[method]);
    }
  });

  return mockAxios;
};

// Helper function to create mock router
export const createMockRouter = (initialEntries = ['/']) => {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    location: {
      pathname: initialEntries[0],
      search: '',
      hash: '',
      state: null
    },
    history: {
      length: initialEntries.length,
      action: 'POP',
      location: {
        pathname: initialEntries[0],
        search: '',
        hash: '',
        state: null
      }
    }
  };
};

// Helper function to create mock match
export const createMockMatch = (params = {}) => ({
  params,
  isExact: true,
  path: '/',
  url: '/'
});

// Helper function to create mock history
export const createMockHistory = (initialEntries = ['/']) => ({
  length: initialEntries.length,
  action: 'POP',
  location: {
    pathname: initialEntries[0],
    search: '',
    hash: '',
    state: null
  },
  push: vi.fn(),
  replace: vi.fn(),
  go: vi.fn(),
  goBack: vi.fn(),
  goForward: vi.fn(),
  block: vi.fn()
});

// Re-export everything from testing-library
export * from '@testing-library/react';
export { customRender as render };
