const express = require('express');
const router = express.Router();
const {
  getComments,
  createComment,
  deleteComment,
  likeComment
} = require('../controllers/commentController');
const { protect } = require('../middleware/auth');

router.get('/blogs/:blogId/comments', getComments);
router.post('/blogs/:blogId/comments', protect, createComment);
router.delete('/comments/:id', protect, deleteComment);
router.put('/comments/:id/like', protect, likeComment);

module.exports = router;
