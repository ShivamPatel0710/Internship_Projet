// models/message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  username: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false } // <-- Add this
});

module.exports = mongoose.model('Message', messageSchema);
