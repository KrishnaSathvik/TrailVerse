const npsService = require('../services/npsService');

// @desc    Get all activities across all parks
// @route   GET /api/activities
// @access  Public
exports.getAllActivities = async (req, res, next) => {
  try {
    const { 
      type, 
      difficulty, 
      duration, 
      park, 
      q,
      limit = 500 
    } = req.query;
    
    console.log('🔍 Fetching all activities with filters:', { type, difficulty, duration, park, q });
    
    // Fetch all activities from NPS API
    let activities = await npsService.getAllActivities(parseInt(limit));
    
    // Apply filters
    if (type) {
      // Filter by activity type (e.g., hiking, camping)
      const typeFilter = type.toLowerCase();
      activities = activities.filter(activity => {
        const tags = activity.tags || [];
        const title = activity.title?.toLowerCase() || '';
        const description = activity.shortDescription?.toLowerCase() || '';
        const longDescription = activity.longDescription?.toLowerCase() || '';
        const activityTypes = activity.activities?.map(a => a.name?.toLowerCase()) || [];
        
        // Check all possible matches
        const hasMatch = 
          tags.some(tag => tag.toLowerCase().includes(typeFilter)) ||
          title.includes(typeFilter) ||
          description.includes(typeFilter) ||
          longDescription.includes(typeFilter) ||
          activityTypes.some(activityType => activityType.includes(typeFilter));
          
        // For hiking, also check for "trail" matches
        if (typeFilter === 'hiking') {
          const hasTrailMatch = 
            tags.some(tag => tag.toLowerCase().includes('trail')) ||
            title.includes('trail') ||
            description.includes('trail') ||
            longDescription.includes('trail') ||
            activityTypes.some(activityType => activityType.includes('trail'));
            
          return hasMatch || hasTrailMatch;
        }
        
        return hasMatch;
      });
    }
    
    if (difficulty) {
      // Filter by difficulty
      const difficultyFilter = difficulty.toLowerCase();
      activities = activities.filter(activity => {
        const activityDifficulty = activity.difficulty?.toLowerCase() || '';
        const desc = activity.shortDescription?.toLowerCase() || '';
        return activityDifficulty.includes(difficultyFilter) || 
               desc.includes(difficultyFilter);
      });
    }
    
    if (duration) {
      // Filter by duration
      const durationFilter = duration.toLowerCase();
      activities = activities.filter(activity => {
        const activityDuration = activity.duration?.toLowerCase() || '';
        return activityDuration.includes(durationFilter);
      });
    }
    
    if (park) {
      // Filter by park code
      const parkFilter = park.toLowerCase();
      activities = activities.filter(activity => 
        activity.parkCode?.toLowerCase() === parkFilter
      );
    }
    
    if (q) {
      // Search by query string
      const query = q.toLowerCase();
      activities = activities.filter(activity => {
        const title = activity.title?.toLowerCase() || '';
        const description = activity.shortDescription?.toLowerCase() || '';
        const location = activity.location?.toLowerCase() || '';
        
        return title.includes(query) ||
               description.includes(query) ||
               location.includes(query);
      });
    }
    
    console.log(`✅ Returning ${activities.length} activities after filters`);
    
    res.status(200).json({
      success: true,
      count: activities.length,
      data: activities
    });
  } catch (error) {
    console.error('❌ Error fetching all activities:', error.message);
    next(error);
  }
};

// @desc    Get activity by ID
// @route   GET /api/activities/:activityId
// @access  Public
exports.getActivityById = async (req, res, next) => {
  try {
    const { activityId } = req.params;
    
    console.log(`🔍 Fetching activity: ${activityId}`);
    
    const activity = await npsService.getActivityById(activityId);
    
    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error(`❌ Error fetching activity ${req.params.activityId}:`, error.message);
    next(error);
  }
};

