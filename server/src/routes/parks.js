const express = require('express');
const router = express.Router();
const {
  getAllParks,
  getParkByCode,
  getParkDetails,
  searchParks,
  getParkAlerts,
  getParkActivities,
  getParkCampgrounds,
  getParkVisitorCenters,
  getParkPlaces,
  getParkTours,
  getParkWebcams,
  getParkVideos,
  getParkGalleryPhotos,
  getParkParkingLots,
  getParkBrochures
} = require('../controllers/parkController');

router.get('/', getAllParks);
router.get('/search', searchParks);
router.get('/:parkCode/details', getParkDetails);
router.get('/:parkCode/alerts', getParkAlerts);
router.get('/:parkCode/activities', getParkActivities);
router.get('/:parkCode/campgrounds', getParkCampgrounds);
router.get('/:parkCode/visitorcenters', getParkVisitorCenters);
router.get('/:parkCode/places', getParkPlaces);
router.get('/:parkCode/tours', getParkTours);
router.get('/:parkCode/webcams', getParkWebcams);
router.get('/:parkCode/videos', getParkVideos);
router.get('/:parkCode/gallery', getParkGalleryPhotos);
router.get('/:parkCode/parkinglots', getParkParkingLots);
router.get('/:parkCode/brochures', getParkBrochures);
router.get('/:parkCode', getParkByCode);

module.exports = router;
