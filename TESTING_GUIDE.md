# Comprehensive Testing Guide

This guide covers the complete testing strategy for the TrailVerse application.

## 🧪 Testing Overview

Our testing strategy includes three main types of tests:

1. **Unit Tests** - Test individual components, services, and utilities in isolation
2. **Integration Tests** - Test API endpoints and data flow between components
3. **End-to-End (E2E) Tests** - Test complete user workflows in a real browser environment

## 📁 Test Structure

```
npe-usa/
├── client/
│   ├── src/
│   │   ├── __tests__/           # Unit tests
│   │   │   ├── components/      # Component tests
│   │   │   ├── services/        # Service tests
│   │   │   ├── utils/           # Utility tests
│   │   │   └── context/         # Context tests
│   │   ├── tests/               # Test utilities and setup
│   │   │   ├── setup.js         # Test setup
│   │   │   ├── mocks/           # Mock handlers
│   │   │   └── utils/           # Test utilities
│   │   └── setupTests.js        # Jest setup
│   ├── tests/
│   │   └── e2e/                 # End-to-end tests
│   ├── vitest.config.js         # Vitest configuration
│   └── playwright.config.js     # Playwright configuration
├── server/
│   ├── tests/
│   │   ├── integration/         # Integration tests
│   │   ├── unit/               # Unit tests
│   │   └── setup.js            # Test setup
│   └── jest.config.js          # Jest configuration
└── .github/workflows/
    └── test.yml                # CI/CD test workflow
```

## 🚀 Running Tests

### Client Tests (Frontend)

```bash
# Run all client tests
cd client
npm run test:all

# Run unit tests only
npm run test:vitest

# Run unit tests with UI
npm run test:vitest:ui

# Run unit tests with coverage
npm run test:vitest:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

### Server Tests (Backend)

```bash
# Run all server tests
cd server
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run integration tests only
npm run test:integration
```

### All Tests

```bash
# Run all tests from root
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🔧 Test Configuration

### Vitest Configuration (Client)

- **Environment**: jsdom for DOM testing
- **Setup**: Custom setup file with mocks and utilities
- **Coverage**: V8 provider with HTML, JSON, and text reports
- **Aliases**: Configured for easy imports

### Jest Configuration (Server)

- **Environment**: Node.js
- **Setup**: MongoDB Memory Server for database testing
- **Coverage**: Comprehensive coverage reporting
- **Timeout**: 30 seconds for async operations

### Playwright Configuration (E2E)

- **Browsers**: Chrome, Firefox, Safari, Mobile Chrome, Mobile Safari
- **Parallel**: Tests run in parallel for speed
- **Retries**: 2 retries on failure in CI
- **Reporters**: HTML and JSON reports

## 📝 Writing Tests

### Unit Tests

#### Component Tests

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { renderWithAuth } from '../utils/testUtils';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('should handle user interaction', () => {
    render(<MyComponent />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByText('Clicked!')).toBeInTheDocument();
  });

  it('should work with authentication', () => {
    renderWithAuth(<MyComponent />);
    expect(screen.getByText('Welcome, Test User')).toBeInTheDocument();
  });
});
```

#### Service Tests

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import authService from '../authService';

// Mock dependencies
vi.mock('axios');

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should login user successfully', async () => {
    const mockResponse = { data: { token: 'mock-token' } };
    authService.api.post.mockResolvedValue(mockResponse);

    const result = await authService.login('test@example.com', 'password');

    expect(authService.api.post).toHaveBeenCalledWith('/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    expect(result).toEqual(mockResponse.data);
  });
});
```

### Integration Tests

```javascript
const request = require('supertest');
const app = require('../../src/app');

describe('Auth Integration', () => {
  it('should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123'
      })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.data.email).toBe('test@example.com');
  });
});
```

### E2E Tests

```javascript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should login successfully', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Welcome')).toBeVisible();
  });
});
```

## 🎯 Test Coverage Goals

- **Unit Tests**: 90%+ coverage
- **Integration Tests**: 80%+ coverage
- **E2E Tests**: Critical user paths covered

## 🔍 Test Utilities

### Mock Data

```javascript
import { mockUser, mockPark, mockEvent } from '../utils/testUtils';

// Use in tests
const user = mockUser;
const park = mockPark;
```

### Custom Render

```javascript
import { renderWithAuth, renderWithoutAuth } from '../utils/testUtils';

// Render with authentication
renderWithAuth(<MyComponent />);

// Render without authentication
renderWithoutAuth(<MyComponent />);
```

### API Mocking

```javascript
import { createMockFetch } from '../utils/testUtils';

const mockFetch = createMockFetch({
  '/api/parks': { data: mockParks, status: 200 },
  '/api/auth/login': { data: { token: 'mock-token' }, status: 200 }
});
```

## 🚨 Common Testing Patterns

### Testing Async Operations

```javascript
it('should handle async operations', async () => {
  render(<AsyncComponent />);
  
  // Wait for async operation
  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### Testing Error States

```javascript
it('should handle errors gracefully', async () => {
  // Mock API to return error
  mockApi.mockRejectedValue(new Error('API Error'));
  
  render(<MyComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });
});
```

### Testing Form Interactions

```javascript
it('should submit form correctly', async () => {
  render(<ContactForm />);
  
  await user.type(screen.getByLabelText('Name'), 'John Doe');
  await user.type(screen.getByLabelText('Email'), 'john@example.com');
  await user.click(screen.getByRole('button', { name: 'Submit' }));
  
  await waitFor(() => {
    expect(screen.getByText('Form submitted')).toBeInTheDocument();
  });
});
```

## 🔧 Debugging Tests

### Vitest Debugging

```bash
# Run tests in debug mode
npm run test:vitest -- --inspect-brk

# Run specific test file
npm run test:vitest -- MyComponent.test.jsx
```

### Playwright Debugging

```bash
# Run tests in debug mode
npm run test:e2e -- --debug

# Run tests with UI
npm run test:e2e:ui
```

### Jest Debugging

```bash
# Run tests in debug mode
npm run test:watch -- --verbose

# Run specific test file
npm test -- auth.test.js
```

## 📊 Test Reports

### Coverage Reports

- **Client**: `client/coverage/index.html`
- **Server**: `server/coverage/lcov-report/index.html`

### E2E Reports

- **Playwright**: `client/playwright-report/index.html`

## 🚀 CI/CD Integration

Tests run automatically on:

- **Push to main/develop**: Full test suite
- **Pull Requests**: Full test suite
- **Scheduled**: Daily security scans

### GitHub Actions Workflow

1. **Client Tests**: Unit tests with coverage
2. **Server Tests**: Unit and integration tests
3. **E2E Tests**: Full browser testing
4. **Linting**: Code quality checks
5. **Security**: Vulnerability scanning
6. **Build**: Production build verification

## 🎯 Best Practices

### Test Organization

- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests independent and isolated

### Mocking

- Mock external dependencies
- Use MSW for API mocking
- Mock browser APIs (localStorage, etc.)
- Clean up mocks after each test

### Assertions

- Use specific assertions
- Test behavior, not implementation
- Include edge cases and error conditions
- Test accessibility features

### Performance

- Run tests in parallel when possible
- Use test data builders for complex objects
- Avoid unnecessary DOM queries
- Mock expensive operations

## 🐛 Troubleshooting

### Common Issues

1. **Tests timing out**: Increase timeout or fix async issues
2. **Mock not working**: Check mock setup and cleanup
3. **DOM not updating**: Use waitFor for async updates
4. **Authentication issues**: Use test utilities for auth state

### Debugging Tips

1. Use `screen.debug()` to see current DOM
2. Add `console.log()` statements in tests
3. Use browser dev tools for E2E tests
4. Check test output for detailed error messages

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [MSW Documentation](https://mswjs.io/)

## 🤝 Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update this guide if needed

Remember: **Good tests are an investment in code quality and maintainability!**
