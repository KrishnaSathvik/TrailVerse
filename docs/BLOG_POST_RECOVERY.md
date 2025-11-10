# Blog Post Recovery Guide

## Current Situation

Blog posts are **hard-deleted** using `findByIdAndDelete`, which permanently removes them from MongoDB. Once deleted, they cannot be recovered unless you have a backup.

## Recovery Options

### Option 1: Restore from Backup (If Available)

If you have a database backup that was created before the blog post was deleted, you can restore it.

#### Step 1: Check for Available Backups

```bash
cd server
node scripts/backup.js list
```

#### Step 2: Restore Blog Posts from Backup

Use the recovery script to restore only blog posts (without affecting other data):

```bash
# Interactive restore (shows list of backups)
node scripts/recover-blog-posts.js restore

# Or restore from specific backup path
node scripts/recover-blog-posts.js restore ../backups/backup-2024-01-01T00-00-00-000Z
```

**Note:** This will merge restored blog posts with existing ones. Duplicates may occur if the blog post still exists.

### Option 2: Full Database Restore (If Needed)

If you need to restore the entire database from a backup:

```bash
cd server
node scripts/restore.js restore
```

**⚠️ Warning:** This will replace ALL data in the database, not just blog posts.

### Option 3: MongoDB Oplog (Advanced)

If MongoDB oplog is enabled and hasn't been rotated, you might be able to recover from oplog:

```bash
# Connect to MongoDB
mongosh "your_mongodb_uri"

# Check oplog (if replica set)
use local
db.oplog.rs.find({ns: "your_database.blogposts"}).sort({ts: -1}).limit(10)
```

**Note:** This only works if:
- MongoDB is running as a replica set
- Oplog is enabled
- The deletion happened recently (before oplog rotation)

### Option 4: Check MongoDB Atlas Backups (If Using Atlas)

If you're using MongoDB Atlas, check for automated backups:

1. Log into MongoDB Atlas
2. Go to your cluster
3. Click "Backups" tab
4. Find a backup from before the deletion
5. Restore from that backup

## Prevention: Implement Soft Delete

To prevent data loss in the future, consider implementing a soft delete mechanism:

### Benefits of Soft Delete:
- ✅ Blog posts can be recovered easily
- ✅ No data loss
- ✅ Can restore deleted posts from admin panel
- ✅ Better audit trail

### Implementation:

1. **Update BlogPost Model** - Add `deletedAt` field:

```javascript
// server/src/models/BlogPost.js
const blogPostSchema = new mongoose.Schema({
  // ... existing fields ...
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Add query middleware to exclude deleted posts
blogPostSchema.pre(/^find/, function(next) {
  if (!this.getOptions().includeDeleted) {
    this.where({ deletedAt: null });
  }
  next();
});
```

2. **Update Delete Controller** - Use soft delete:

```javascript
// server/src/controllers/blogController.js
exports.deletePost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // Soft delete - set deletedAt instead of removing
    post.deletedAt = new Date();
    await post.save();
    
    clearCache('blogs');
    
    res.status(200).json({
      success: true,
      message: 'Blog post deleted'
    });
  } catch (error) {
    next(error);
  }
};
```

3. **Add Restore Endpoint**:

```javascript
// server/src/controllers/blogController.js
exports.restorePost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // Restore - clear deletedAt
    post.deletedAt = null;
    await post.save();
    
    clearCache('blogs');
    
    res.status(200).json({
      success: true,
      message: 'Blog post restored',
      data: post
    });
  } catch (error) {
    next(error);
  }
};
```

4. **Add Permanent Delete Endpoint** (for admin):

```javascript
// server/src/controllers/blogController.js
exports.permanentlyDeletePost = async (req, res, next) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        error: 'Blog post not found'
      });
    }
    
    // Permanent delete - actually remove from database
    await BlogPost.findByIdAndDelete(req.params.id);
    
    clearCache('blogs');
    
    res.status(200).json({
      success: true,
      message: 'Blog post permanently deleted'
    });
  } catch (error) {
    next(error);
  }
};
```

## Regular Backups

To prevent data loss, set up regular backups:

### Manual Backup:

```bash
cd server
node scripts/backup.js create
```

### Automated Backups (Cron Job):

Add to your crontab:

```bash
# Daily backup at 2 AM
0 2 * * * cd /path/to/server && node scripts/backup.js create
```

### MongoDB Atlas Automated Backups:

If using MongoDB Atlas, enable automated backups in the Atlas dashboard.

## Recovery Scripts

### List Available Backups:

```bash
cd server
node scripts/backup.js list
```

### Restore Blog Posts Only:

```bash
cd server
node scripts/recover-blog-posts.js restore
```

### Full Database Restore:

```bash
cd server
node scripts/restore.js restore
```

## Summary

**Current Status:**
- ❌ Blog posts are hard-deleted (permanently removed)
- ❌ No soft delete mechanism
- ✅ Recovery script available (if backup exists)
- ✅ Backup scripts available

**Recommendations:**
1. **Immediate:** Check for backups and restore if available
2. **Short-term:** Implement soft delete mechanism
3. **Long-term:** Set up automated backups

**If No Backup Available:**
Unfortunately, if there's no backup, the deleted blog post cannot be recovered. You'll need to recreate it manually.

