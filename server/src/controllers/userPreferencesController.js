const UserPreferences = require('../models/UserPreferences');

// @desc    Get user preferences
// @route   GET /api/users/preferences
// @access  Private
exports.getPreferences = async (req, res, next) => {
  try {
    const preferences = await UserPreferences.getOrCreate(req.user.id);
    
    res.status(200).json({
      success: true,
      data: preferences
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user preferences
// @route   PUT /api/users/preferences
// @access  Private
exports.updatePreferences = async (req, res, next) => {
  try {
    const { theme, preferences, deviceInfo } = req.body;
    
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    
    // Update theme if provided
    if (theme) {
      userPreferences.theme = theme;
    }
    
    // Update preferences if provided
    if (preferences) {
      await userPreferences.updatePreferences(preferences);
    }
    
    // Register device if provided
    if (deviceInfo) {
      await userPreferences.registerDevice(deviceInfo);
    }
    
    await userPreferences.save();
    
    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyPreferencesUpdated(req.user.id, userPreferences);
    }
    
    res.status(200).json({
      success: true,
      data: userPreferences
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update map state
// @route   PUT /api/users/preferences/map-state
// @access  Private
exports.updateMapState = async (req, res, next) => {
  try {
    const { mapState, deviceInfo } = req.body;
    
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    
    await userPreferences.updateMapState(mapState);
    
    // Register device if provided
    if (deviceInfo) {
      await userPreferences.registerDevice(deviceInfo);
    }
    
    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyPreferencesUpdated(req.user.id, userPreferences);
    }
    
    res.status(200).json({
      success: true,
      data: userPreferences.mapState
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update navigation state
// @route   PUT /api/users/preferences/navigation
// @access  Private
exports.updateNavigation = async (req, res, next) => {
  try {
    const { navigation, deviceInfo } = req.body;
    
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    
    await userPreferences.updateNavigation(navigation);
    
    // Register device if provided
    if (deviceInfo) {
      await userPreferences.registerDevice(deviceInfo);
    }
    
    // Notify via WebSocket
    const wsService = req.app.get('wsService');
    if (wsService) {
      wsService.notifyPreferencesUpdated(req.user.id, userPreferences);
    }
    
    res.status(200).json({
      success: true,
      data: userPreferences.navigation
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active devices
// @route   GET /api/users/preferences/devices
// @access  Private
exports.getActiveDevices = async (req, res, next) => {
  try {
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    const activeDevices = userPreferences.getActiveDevices();
    
    res.status(200).json({
      success: true,
      data: activeDevices
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register device
// @route   POST /api/users/preferences/devices
// @access  Private
exports.registerDevice = async (req, res, next) => {
  try {
    const { deviceInfo } = req.body;
    
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    await userPreferences.registerDevice(deviceInfo);
    
    res.status(200).json({
      success: true,
      data: userPreferences.devices
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Sync preferences across devices
// @route   POST /api/users/preferences/sync
// @access  Private
exports.syncPreferences = async (req, res, next) => {
  try {
    const { lastSyncAt, deviceInfo } = req.body;
    
    const userPreferences = await UserPreferences.getOrCreate(req.user.id);
    
    // Register device
    if (deviceInfo) {
      await userPreferences.registerDevice(deviceInfo);
    }
    
    // Check if sync is needed
    const needsSync = !lastSyncAt || new Date(lastSyncAt) < userPreferences.lastSyncAt;
    
    res.status(200).json({
      success: true,
      data: {
        preferences: userPreferences,
        needsSync,
        lastSyncAt: userPreferences.lastSyncAt,
        syncVersion: userPreferences.syncVersion
      }
    });
  } catch (error) {
    next(error);
  }
};
