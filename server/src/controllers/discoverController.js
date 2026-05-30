const discoverCatalogService = require('../services/discoverCatalogService');
const npsService = require('../services/npsService');

exports.getCatalog = async (req, res, next) => {
  try {
    const force = req.query.refresh === 'true';
    const catalog = await discoverCatalogService.getCatalog({ force });
    const { indexes, relatedActivities, relatedTopics, amenities, ...publicCatalog } = catalog;

    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    res.status(200).json({
      success: true,
      data: publicCatalog
    });
  } catch (error) {
    next(error);
  }
};

exports.getDetail = async (req, res, next) => {
  try {
    const { dimension, slug } = req.query;
    if (!dimension || !slug) {
      return res.status(400).json({
        success: false,
        error: 'dimension and slug query parameters are required'
      });
    }

    const allowed = ['activity', 'topic', 'type'];
    if (!allowed.includes(dimension)) {
      return res.status(400).json({
        success: false,
        error: 'dimension must be activity, topic, or type'
      });
    }

    const detail = await discoverCatalogService.getDetail(dimension, slug);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: 'Discover entry not found'
      });
    }

    res.set('Cache-Control', 'public, max-age=1800, s-maxage=3600');
    res.status(200).json({
      success: true,
      data: detail
    });
  } catch (error) {
    next(error);
  }
};

exports.getNpsGuide = async (req, res, next) => {
  try {
    const { title, slug } = req.query;
    if (!title) {
      return res.status(400).json({
        success: false,
        error: 'title query parameter is required'
      });
    }

    const guide = await npsService.getNpsGuideForDiscover({ title, slug });
    res.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).json({
      success: true,
      data: guide
    });
  } catch (error) {
    next(error);
  }
};

exports.getParksPage = async (req, res, next) => {
  try {
    const { dimension, slug, page = 1, limit = 24 } = req.query;
    if (!dimension || !slug) {
      return res.status(400).json({
        success: false,
        error: 'dimension and slug query parameters are required'
      });
    }

    const result = await discoverCatalogService.getParksPage(dimension, slug, {
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 12, 100),
      nationalParksOnly: req.query.nationalParksOnly === 'true'
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Discover entry not found'
      });
    }

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};
