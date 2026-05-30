const express = require('express');
const router = express.Router();
const {
  getAllParks,
  getParkByCode,
  getParkDetails,
  searchParks,
  getParkAlerts,
  getParkActivities,
  getMapPlaces,
  getMapCampgrounds,
  getParkCampgrounds,
  getParkVisitorCenters,
  getParkPlaces,
  getParkTours,
  getParkWebcams,
  getParkVideos,
  getParkGalleryPhotos,
  getParkParkingLots,
  getParkBrochures,
  getParkPermits,
  getParkFacilities,
  getParkTransit
} = require('../controllers/parkController');

router.get('/', getAllParks);
router.get('/search', searchParks);
router.get('/map/places', getMapPlaces);
router.get('/map/campgrounds', getMapCampgrounds);
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
router.get('/:parkCode/transit', getParkTransit);
router.get('/:parkCode/brochures', getParkBrochures);
router.get('/:parkCode/permits', getParkPermits);
router.get('/:parkCode/facilities', getParkFacilities);
router.get('/:parkCode', getParkByCode);

module.exports = router;
