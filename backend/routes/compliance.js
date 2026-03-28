const express = require('express');
const router = express.Router();
const { getEvents, createEvent, updateEvent, deleteEvent, getCalendar, getScore, getAlerts } = require('../controllers/complianceController');

router.get('/', getEvents);
router.post('/', createEvent);
router.get('/calendar', getCalendar);
router.get('/score', getScore);
router.get('/alerts', getAlerts);
router.put('/:id', updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
