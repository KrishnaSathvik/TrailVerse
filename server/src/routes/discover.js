const express = require('express');
const router = express.Router();
const {
  getCatalog,
  getDetail,
  getParksPage,
  getNpsGuide
} = require('../controllers/discoverController');

router.get('/catalog', getCatalog);
router.get('/detail', getDetail);
router.get('/parks', getParksPage);
router.get('/nps-guide', getNpsGuide);

module.exports = router;
