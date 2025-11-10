const express = require('express');
const router = express.Router();
const {
  getAllPosts,
  getPostBySlug,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  getBlogCategories,
  getBlogTags,
  toggleLike,
  toggleFavorite,
  getFavoritedPosts,
  publishScheduledPosts,
  getScheduledPosts
} = require('../controllers/blogController');
const { protect, admin, optionalAuth } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

/**
 * @swagger
 * components:
 *   schemas:
 *     BlogPost:
 *       type: object
 *       required:
 *         - title
 *         - content
 *         - excerpt
 *         - author
 *         - category
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the blog post
 *         title:
 *           type: string
 *           description: The title of the blog post
 *         slug:
 *           type: string
 *           description: URL-friendly version of the title
 *         content:
 *           type: string
 *           description: The full content of the blog post
 *         excerpt:
 *           type: string
 *           description: Short description of the blog post
 *         author:
 *           type: string
 *           description: ID of the author
 *         category:
 *           type: string
 *           description: Category of the blog post
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Tags associated with the blog post
 *         featured:
 *           type: boolean
 *           description: Whether the post is featured
 *         status:
 *           type: string
 *           enum: [draft, published, archived]
 *           description: Publication status
 *         views:
 *           type: number
 *           description: Number of views
 *         likes:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs who liked the post
 *         favorites:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs who favorited the post
 *         publishedAt:
 *           type: string
 *           format: date-time
 *           description: Publication date
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation date
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update date
 */

// Middleware for blog creation/update routes to handle larger payloads
const blogBodyParser = express.json({ limit: '10mb' });

/**
 * @swagger
 * /blogs:
 *   get:
 *     summary: Get all blog posts
 *     description: Retrieve paginated list of blog posts with optional filtering
 *     tags: [Blogs]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of posts per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filter by tag
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title and content
 *       - in: query
 *         name: featured
 *         schema:
 *           type: boolean
 *         description: Filter featured posts
 *     responses:
 *       200:
 *         description: Successfully retrieved blog posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   example: 12
 *                 total:
 *                   type: integer
 *                   example: 50
 *                 page:
 *                   type: integer
 *                   example: 1
 *                 pages:
 *                   type: integer
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BlogPost'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', cacheMiddleware(300), getAllPosts); // Cache for 5 minutes - reduced for faster updates

/**
 * @swagger
 * /blogs/categories:
 *   get:
 *     summary: Get blog categories
 *     description: Retrieve all available blog categories
 *     tags: [Blogs]
 *     responses:
 *       200:
 *         description: Successfully retrieved categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["Travel", "Adventure", "Photography"]
 *       500:
 *         description: Server error
 */
router.get('/categories', cacheMiddleware(1800), getBlogCategories); // Cache for 30 minutes

/**
 * @swagger
 * /blogs/tags:
 *   get:
 *     summary: Get blog tags
 *     description: Retrieve all available blog tags
 *     tags: [Blogs]
 *     responses:
 *       200:
 *         description: Successfully retrieved tags
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["hiking", "camping", "wildlife"]
 *       500:
 *         description: Server error
 */
router.get('/tags', cacheMiddleware(1800), getBlogTags); // Cache for 30 minutes

/**
 * @swagger
 * /blogs/id/{id}:
 *   get:
 *     summary: Get blog post by ID (Admin only)
 *     description: Retrieve a blog post by its ID with full content (Admin access required)
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Successfully retrieved blog post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BlogPost'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Blog post not found
 */
router.get('/id/:id', protect, admin, getPostById); // Admin route to get post by ID with full content

/**
 * @swagger
 * /blogs/favorites:
 *   get:
 *     summary: Get user's favorite blog posts
 *     description: Retrieve all blog posts favorited by the authenticated user
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved favorite posts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BlogPost'
 *       401:
 *         description: Unauthorized
 */
router.get('/favorites', protect, getFavoritedPosts);

/**
 * @swagger
 * /blogs/{id}/like:
 *   post:
 *     summary: Toggle like on a blog post
 *     description: Like or unlike a blog post
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Successfully toggled like
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Blog post not found
 */
router.post('/:id/like', optionalAuth, toggleLike);

/**
 * @swagger
 * /blogs/{id}/favorite:
 *   post:
 *     summary: Toggle favorite on a blog post
 *     description: Add or remove a blog post from favorites
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Successfully toggled favorite
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Blog post not found
 */
router.post('/:id/favorite', optionalAuth, toggleFavorite);

/**
 * @swagger
 * /blogs:
 *   post:
 *     summary: Create a new blog post (Admin only)
 *     description: Create a new blog post with the provided data
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *               - excerpt
 *               - category
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Amazing National Park Adventure"
 *               content:
 *                 type: string
 *                 example: "Full blog post content here..."
 *               excerpt:
 *                 type: string
 *                 example: "Short description of the blog post"
 *               category:
 *                 type: string
 *                 example: "Travel"
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["hiking", "adventure", "photography"]
 *               featured:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Blog post created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BlogPost'
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/', blogBodyParser, protect, admin, createPost);

/**
 * @swagger
 * /blogs/publish-scheduled:
 *   post:
 *     summary: Publish scheduled blog posts (Admin only)
 *     description: Manually trigger publishing of scheduled blog posts that are due
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled posts published successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BlogPost'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.post('/publish-scheduled', protect, admin, publishScheduledPosts);

/**
 * @swagger
 * /blogs/scheduled:
 *   get:
 *     summary: Get scheduled blog posts information (Admin only)
 *     description: Retrieve information about scheduled blog posts
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Scheduled posts information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                     dueSoon:
 *                       type: number
 *                     overdue:
 *                       type: number
 *                     scheduledPosts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           scheduledAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/scheduled', protect, admin, getScheduledPosts);

/**
 * @swagger
 * /blogs/{id}:
 *   put:
 *     summary: Update a blog post (Admin only)
 *     description: Update an existing blog post
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BlogPost'
 *     responses:
 *       200:
 *         description: Blog post updated successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Blog post not found
 *   delete:
 *     summary: Delete a blog post (Admin only)
 *     description: Delete a blog post permanently
 *     tags: [Blogs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post ID
 *     responses:
 *       200:
 *         description: Blog post deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Blog post not found
 */
router.put('/:id', blogBodyParser, protect, admin, updatePost);
router.delete('/:id', protect, admin, deletePost);

/**
 * @swagger
 * /blogs/{slug}:
 *   get:
 *     summary: Get blog post by slug
 *     description: Retrieve a blog post by its URL-friendly slug
 *     tags: [Blogs]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: Blog post slug
 *     responses:
 *       200:
 *         description: Successfully retrieved blog post
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/BlogPost'
 *       404:
 *         description: Blog post not found
 *       500:
 *         description: Server error
 */
router.get('/:slug', cacheMiddleware(300), getPostBySlug); // Cache for 5 minutes

module.exports = router;
