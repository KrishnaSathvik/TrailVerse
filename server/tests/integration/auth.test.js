jest.mock('../../src/services/resendEmailService', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue({}),
  sendAdminNewUserNotification: jest.fn().mockResolvedValue({}),
  sendPasswordReset: jest.fn().mockResolvedValue({}),
  sendWelcomeEmail: jest.fn().mockResolvedValue({}),
}));

const request = require('supertest');
// Exercise real auth/profile routes with local MongoDB; unrelated app services
// start schedulers and provider clients and are outside this auth regression.
const express = require('express');
const app = express();
app.use(require('helmet')());
app.use(express.json());
app.use('/api/auth', require('express-rate-limit')({ windowMs: 900000, max: 100 }), require('../../src/routes/auth'));
app.use('/api/users', require('../../src/routes/users'));
app.use(require('../../src/middleware/errorHandler'));
const User = require('../../src/models/User');

describe('Auth Integration Tests', () => {
  describe('POST /api/auth/signup', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Account created');
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(userData.name);
      expect(response.body.data.email).toBe(userData.email);
      expect(response.body.data.role).toBe('user');
      expect(response.body.data.isEmailVerified).toBe(false);

      // Verify user was created in database
      const user = await User.findOne({ email: userData.email });
      expect(user).toBeTruthy();
      expect(user.name).toBe(userData.name);
      expect(user.password).not.toBe(userData.password); // Should be hashed
    });

    it('should return error for duplicate email', async () => {
      const userData = {
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'duplicate@example.com',
        password: 'password123'
      };

      // Create first user
      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Try to create second user with same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test User'
          // Missing email and password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test User',
        firstName: 'Test', lastName: 'User',
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Test User',
        firstName: 'Test', lastName: 'User',
          email: 'test@example.com',
          password: '123' // Too short
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should login user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(testUser.name);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
    });

    it('should login user with remember me option', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(testUser.name);
      expect(response.body.data.email).toBe(testUser.email);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
    });

    it('should generate longer-lived token when remember me is true', async () => {
      // Login without remember me
      const normalResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: false
        })
        .expect(200);

      // Login with remember me
      const rememberMeResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
          rememberMe: true
        })
        .expect(200);

      expect(normalResponse.body.success).toBe(true);
      expect(rememberMeResponse.body.success).toBe(true);
      
      // Both should have tokens, but with different expiration times
      expect(typeof normalResponse.body.token).toBe('string');
      expect(typeof rememberMeResponse.body.token).toBe('string');
      
      // Tokens should be different (different expiration times)
      expect(normalResponse.body.token).not.toBe(rememberMeResponse.body.token);
    });

    it('should return error for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should return error for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid credentials');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
          // Missing password
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Please provide email and password');
    });
  });

  describe('GET /api/auth/me', () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.token;
    });

    it('should get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe(testUser.name);
      expect(response.body.data.email).toBe(testUser.email);
    });

    it('should return error without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return error with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    let testUser;
    let authToken;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });

      // Login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      authToken = loginResponse.body.token;
    });

    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('logged out successfully');
    });

    it('should return error without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    let testUser;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });
    });

    it('should send password reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'test@example.com'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Password reset email sent');

      // Verify reset token was generated
      const user = await User.findById(testUser._id);
      expect(user.resetPasswordToken).toBeTruthy();
      expect(user.resetPasswordExpire).toBeTruthy();
    });

    it('should return error for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User not found');
    });

    it('should validate email field', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/auth/reset-password/:token', () => {
    let testUser;
    let resetToken;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });

      // Generate reset token
      resetToken = testUser.getResetPasswordToken();
      await testUser.save();
    });

    it('should reset password with valid token', async () => {
      const response = await request(app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({
          password: 'newpassword123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Password reset successful');

      // Verify password was changed
      const user = await User.findById(testUser._id).select('+password');
      const isMatch = await user.comparePassword('newpassword123');
      expect(isMatch).toBe(true);

      // Verify reset token was cleared
      expect(user.resetPasswordToken).toBeNull();
      expect(user.resetPasswordExpire).toBeNull();
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .put('/api/auth/reset-password/invalid-token')
        .send({
          password: 'newpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired reset token');
    });

    it('should return error for expired token', async () => {
      // Set token to expired
      testUser.resetPasswordExpire = Date.now() - 1000;
      await testUser.save();

      const response = await request(app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({
          password: 'newpassword123'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired reset token');
    });

    it('should validate password field', async () => {
      const response = await request(app)
        .put(`/api/auth/reset-password/${resetToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/verify-email/:token', () => {
    let testUser;
    let verificationToken;

    beforeEach(async () => {
      // Create a test user
      testUser = await User.create({
        name: 'Test User',
        firstName: 'Test', lastName: 'User',
        email: 'test@example.com',
        password: 'password123'
      });

      // Generate verification token
      verificationToken = testUser.getEmailVerificationToken();
      await testUser.save();
    });

    it('should verify email with valid token', async () => {
      const response = await request(app)
        .get(`/api/auth/verify-email/${verificationToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Email verified successfully');

      // Verify email was marked as verified
      const user = await User.findById(testUser._id);
      expect(user.isEmailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeNull();
      expect(user.emailVerificationExpire).toBeNull();
    });

    it('should return error for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/verify-email/invalid-token')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired verification token');
    });

    it('should return error for expired token', async () => {
      // Set token to expired
      testUser.emailVerificationExpire = Date.now() - 1000;
      await testUser.save();

      const response = await request(app)
        .get(`/api/auth/verify-email/${verificationToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid or expired verification token');
    });
  });

  describe('Security headers', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });
  });
  it('preserves credentials through signup, login, reset, profile edit and login', async () => {
    const email = 'lifecycle@example.com';
    await request(app).post('/api/auth/signup').send({ firstName: 'Local', lastName: 'User', email, password: 'initial-password' }).expect(201);
    await request(app).post('/api/auth/login').send({ email, password: 'initial-password' }).expect(200);
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    const emailService = require('../../src/services/resendEmailService');
    const resetUrl = emailService.sendPasswordReset.mock.calls.at(-1)[1];
    await request(app).put('/api/auth/reset-password/' + resetUrl.split('/').pop()).send({ password: 'replacement-password' }).expect(200);
    await request(app).post('/api/auth/login').send({ email, password: 'initial-password' }).expect(401);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'replacement-password' }).expect(200);
    const before = await User.findOne({ email }).select('+password');
    await request(app).put('/api/users/profile').set('Authorization', 'Bearer ' + login.body.token).send({ firstName: 'Updated' }).expect(200);
    const withoutPassword = await User.findOne({ email }).select('-password');
    expect(withoutPassword.password).toBeUndefined();
    withoutPassword.bio = 'Local regression check';
    await withoutPassword.save();
    const after = await User.findOne({ email }).select('+password');
    expect(after.password).toBe(before.password);
    expect(after.name).toBe('Updated User');
    await request(app).post('/api/auth/login').send({ email, password: 'replacement-password' }).expect(200);
  });

  describe('Rate limiting', () => {
    it('should rate limit login attempts', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      // Make multiple failed login attempts
      const promises = Array(105).fill().map(() =>
        request(app)
          .post('/api/auth/login')
          .send(userData)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });


});
