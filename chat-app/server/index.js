const dotenv = require('dotenv')
dotenv.config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

// Middleware
const verifyToken = require('./middleware/verifyToken');

// Models
const Message = require('./models/message');
const PrivateMessage = require('./models/PrivateMessage');
const RoomMessage = require('./models/RoomMessage');

// Routes
const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protected');

// App setup
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.get('/',(req,res)=>{
  res.send("Api is running")
})
app.use('/api/auth', authRoutes);
app.use('/api/user', protectedRoutes);
app.put('/api/messages/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  try {
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // Only the original sender can edit
    const decoded = jwt.verify(req.headers.authorization.split(" ")[1], process.env.JWT_SECRET);
    if (message.username !== decoded.username) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    message.text = text;
    message.edited = true;
    await message.save();

    io.emit("messageEdited", message); // Broadcast to others
    res.json({ message: 'Message updated', data: message });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update message' });
  }
});
app.delete('/api/messages/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const message = await Message.findById(id);
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const decoded = jwt.verify(req.headers.authorization.split(" ")[1], process.env.JWT_SECRET);
    if (message.username !== decoded.username) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await message.remove();
    io.emit("messageDeleted", { id }); // Notify others
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});
// ========================================


// ✅ Secure - Public message history
app.get('/api/messages', verifyToken, async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ✅ Secure - Private message history
app.get('/api/private-messages/:from/:to', verifyToken, async (req, res) => {
  const { from, to } = req.params;
  try {
    const messages = await PrivateMessage.find({
      $or: [{ from, to }, { from: to, to: from }]
    }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch private messages' });
  }
});

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error(err));

// ========================================
// ========== SOCKET.IO SETUP ============
// ========================================

let onlineUsers = {};      // { socket.id: username }
let userSockets = {};      // { username: socket.id }
let userRooms = {};        // { username: room }

// ✅ JWT Middleware for Socket.IO
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.username = decoded.username;
    next();
  } catch (err) {
    return next(new Error("Authentication error"));
  }
});

io.on('connection', (socket) => {
  console.log(`📡 New user connected: ${socket.id}`);

  // ✅ Track user
  onlineUsers[socket.id] = socket.username;
  userSockets[socket.username] = socket.id;
  io.emit('updateUsers', Object.values(userSockets));

  // ✅ Join Room
  socket.on("joinRoom", async ({ username, room }) => {
    socket.join(room);
    userRooms[username] = room;
    console.log(`🏠 ${username} joined room: ${room}`);

    try {
      const history = await RoomMessage.find({ room }).sort({ timestamp: 1 });
      socket.emit("roomHistory", history);
    } catch (err) {
      console.error("❌ Error loading room history:", err);
    }
  });

  // ✅ Room Message
  socket.on("roomMessage", async ({ username, room, text }) => {
    try {
      const message = new RoomMessage({ room, username, text });
      await message.save();

      io.to(room).emit("roomMessage", {
        username,
        text,
        room,
        timestamp: message.timestamp
      });
    } catch (err) {
      console.error("❌ Error saving room message:", err);
    }
  });

  // ✅ Public Message
  socket.on('sendMessage', async ({ username, text }) => {
    const message = new Message({
      username,
      text,
      timestamp: new Date()
    });
    await message.save();
    io.emit('receiveMessage', message);
  });

  // ✅ Private Message
  socket.on('privateMessage', async ({ from, to, message }) => {
    const toSocketId = userSockets[to];
    const timestamp = new Date();
    const newPrivateMsg = new PrivateMessage({ from, to, message, timestamp });
    await newPrivateMsg.save();

    socket.emit('privateMessage', { from, to, message, timestamp });
    if (toSocketId) {
      io.to(toSocketId).emit('privateMessage', { from, to, message, timestamp });
    }
  });

  // ✅ Typing Indicators
  socket.on("typing", () => {
    socket.broadcast.emit("userTyping", socket.username);
  });

  socket.on("stopTyping", () => {
    socket.broadcast.emit("userStoppedTyping", socket.username);
  });

  // ✅ Get Room History on Demand
  socket.on('getRoomHistory', async (roomName, callback) => {
    try {
      const messages = await RoomMessage.find({ room: roomName }).sort({ timestamp: 1 }).limit(100);
      callback(messages);
    } catch (err) {
      console.error("❌ Error fetching room history:", err);
      callback([]);
    }
  });

  // ✅ Disconnect
  socket.on('disconnect', () => {
    const username = onlineUsers[socket.id];
    console.log(`❌ Disconnected: ${socket.id}`);
    delete userSockets[username];
    delete onlineUsers[socket.id];
    delete userRooms[username];
    io.emit('updateUsers', Object.values(userSockets));
  });
});

// ========================================
// ========== SERVER STARTUP =============
// ========================================

const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
