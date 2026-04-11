const express = require('express');
const router = express.Router();
const {
  getNotifications,
  dismissNotification,
  dismissAllNotifications,
} = require('../controllers/notificationsController');

router.get('/', getNotifications);
router.post('/dismiss', dismissNotification);
router.post('/dismiss-all', dismissAllNotifications);

module.exports = router;
