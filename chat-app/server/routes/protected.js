const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth'); // this is your JWT middleware

// Protected test route
router.get('/profile', verifyToken, (req, res) => {
  res.json({
    message: `Welcome ${req.user.username}, this is your protected profile!`
  });
});

module.exports = router;
