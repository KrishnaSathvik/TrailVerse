const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const BlogPost = require('../src/models/BlogPost');
const User = require('../src/models/User');

describe('Blog Controller', () => {
  let authToken;
  let testUser;
  let testPost;

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/trailverse-test');
  });

  beforeEach(async () => {
    // Clean up database
    await BlogPost.deleteMany({});
    await User.deleteMany({});

    // Create test user
    testUser = await User.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      role: 'admin'
    });

    // Create auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    
    authToken = loginResponse.body.token;

    // Create test blog post
    testPost = await BlogPost.create({
      title: 'Test Blog Post',
      slug: 'test-blog-post',
      content: 'This is test content',
      excerpt: 'Test excerpt',
      author: testUser._id,
      category: 'Travel',
      tags: ['hiking', 'adventure'],
      status: 'published'
    });
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('GET /api/blogs', () => {
    it('should get all published blog posts', async () => {
      const response = await request(app)
        .get('/api/blogs')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Test Blog Post');
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/blogs?category=Travel')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should filter by tag', async () => {
      const response = await request(app)
        .get('/api/blogs?tag=hiking')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/blogs?page=1&limit=10')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.page).toBe(1);
      expect(response.body.pages).toBe(1);
    });
  });

  describe('GET /api/blogs/:slug', () => {
    it('should get blog post by slug', async () => {
      const response = await request(app)
        .get(`/api/blogs/${testPost.slug}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Test Blog Post');
    });

    it('should return 404 for non-existent slug', async () => {
      const response = await request(app)
        .get('/api/blogs/non-existent-slug')
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/blogs', () => {
    it('should create a new blog post (admin only)', async () => {
      const newPost = {
        title: 'New Blog Post',
        content: 'New content',
        excerpt: 'New excerpt',
        category: 'Adventure',
        tags: ['camping']
      };

      const response = await request(app)
        .post('/api/blogs')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newPost)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('New Blog Post');
    });

    it('should return 401 without auth token', async () => {
      const response = await request(app)
        .post('/api/blogs')
        .send({
          title: 'New Post',
          content: 'Content',
          excerpt: 'Excerpt',
          category: 'Travel'
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/blogs/:id', () => {
    it('should update blog post (admin only)', async () => {
      const updateData = {
        title: 'Updated Title',
        content: 'Updated content'
      };

      const response = await request(app)
        .put(`/api/blogs/${testPost._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('DELETE /api/blogs/:id', () => {
    it('should delete blog post (admin only)', async () => {
      const response = await request(app)
        .delete(`/api/blogs/${testPost._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify post is deleted
      const deletedPost = await BlogPost.findById(testPost._id);
      expect(deletedPost).toBeNull();
    });
  });
});
