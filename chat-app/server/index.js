require('dotenv').config();


const express = require('express');
const http = require('http'); // 👈 needed for socket server
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app); // 👈 create HTTP server manually
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

//Connect to mongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error(err));


//Routes  
const authRoutes = require('./routes/authRoutes');
const protectedRoutes = require('./routes/protected');
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/auth', authRoutes);
app.use('/api/user', protectedRoutes);

//Socket.IO handling
io.on('connection', (socket) => {
  console.log(`📡 New user connected: ${socket.id}`);

  socket.on('sendMessage', (data) => {
    console.log('📨 Message received:', data);
    io.emit('receiveMessage', data); // broadcast to everyone
  });

  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});


//Start the Server
const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
