require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const Message = require('./models/message');
const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protected');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/auth', authRoutes);
app.use('/api/user', protectedRoutes);

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error(err));

// ✅ Track online users (in-memory)
let onlineUsers = {};

// ✅ Socket.IO Events
io.on('connection', (socket) => {
  console.log(`📡 New user connected: ${socket.id}`);

  // Handle new user login
  socket.on('userConnected', (username) => {
    socket.username = username;
    onlineUsers[socket.id] = username;
    io.emit('updateUsers', Object.values(onlineUsers)); // broadcast list
  });

  // Handle message send
  socket.on('sendMessage', async (data) => {
    console.log('📨 Message received:', data);

    const message = new Message({
      username: data.username || 'Guest',
      text: data.text,
      timestamp: data.timestamp || new Date()
    });

    await message.save();
    io.emit('receiveMessage', message); // broadcast the saved message
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    delete onlineUsers[socket.id];
    io.emit('updateUsers', Object.values(onlineUsers));
  });
});

// ✅ Start server
const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
