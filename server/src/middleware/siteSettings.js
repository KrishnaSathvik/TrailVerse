const SiteSettings = require('../models/SiteSettings');

const CACHE_TTL_MS = 60 * 1000;
let cachedSettings = null;
let cacheExpiresAt = 0;

async function getCachedSiteSettings() {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) {
    return cachedSettings;
  }
  cachedSettings = await SiteSettings.getSettings();
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedSettings;
}

exports.invalidateSiteSettingsCache = () => {
  cachedSettings = null;
  cacheExpiresAt = 0;
};

/** Attach site settings to every API request (cached). */
exports.loadSiteSettings = async (req, res, next) => {
  try {
    req.siteSettings = await getCachedSiteSettings();
    next();
  } catch (error) {
    next(error);
  }
};

const isAdminRequest = (req) => req.user?.role === 'admin';

const isExemptFromMaintenance = (req) => {
  const path = req.path || '';
  return (
    path.startsWith('/auth') ||
    path.startsWith('/admin') ||
    path.startsWith('/settings') ||
    path === '/health' ||
    path.startsWith('/health')
  );
};

/** Block public API traffic when maintenance mode is on (admins still allowed). */
exports.enforceMaintenanceMode = (req, res, next) => {
  if (!req.siteSettings?.maintenanceMode) {
    return next();
  }
  if (isExemptFromMaintenance(req) || isAdminRequest(req)) {
    return next();
  }
  return res.status(503).json({
    success: false,
    maintenance: true,
    error: req.siteSettings.maintenanceMessage || 'Site is under maintenance.',
  });
};

/** Gate a route behind a SiteSettings feature flag (e.g. enableBlog). */
exports.requireFeature = (featureKey) => (req, res, next) => {
  if (req.siteSettings?.[featureKey] !== false) {
    return next();
  }
  if (isAdminRequest(req)) {
    return next();
  }
  return res.status(403).json({
    success: false,
    error: 'This feature is temporarily unavailable.',
  });
};
