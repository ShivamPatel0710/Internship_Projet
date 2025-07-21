const mongoose = require('mongoose');

const roomMessageSchema = new mongoose.Schema({
  room: { type: String, required: true },
  username: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('RoomMessage', roomMessageSchema);