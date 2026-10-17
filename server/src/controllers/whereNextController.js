'use strict';

const {
  upsertPick,
  setTravelWindow,
  getMe,
  getPublicStats,
} = require('../services/whereNextPickService');

function handleError(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) {
    console.error('where-next error:', err);
  }
  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Unable to save destination' : err.message,
  });
}

exports.createOrReplacePick = async (req, res) => {
  try {
    const result = await upsertPick({
      sessionId: req.body?.sessionId,
      rawInput: req.body?.rawInput,
      parkCode: req.body?.parkCode,
      source: req.body?.source,
      userId: req.user?._id || null,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
};

exports.patchPick = async (req, res) => {
  try {
    const result = await setTravelWindow({
      sessionId: req.body?.sessionId,
      travelWindow: req.body?.travelWindow,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getMyPick = async (req, res) => {
  try {
    const result = await getMe(req.query?.sessionId);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    handleError(res, err);
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await getPublicStats();
    res.status(200).json({ success: true, data: { stats } });
  } catch (err) {
    handleError(res, err);
  }
};
