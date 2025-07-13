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

const Message = require('./models/message.js');


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

  socket.on('sendMessage', async (data) => {
  console.log('📨 Message received:', data); // ✅ This should show an object, not just a string

  try {
    // Validate data type
    if (typeof data !== 'object' || !data.text) {
      console.error('❌ Invalid message format received:', data);
      return;
    }

    const message = new Message({
      username: data.username || 'Anonymous',
      text: data.text
    });

    await message.save(); // Save to MongoDB
    io.emit('receiveMessage', message); // Broadcast to all clients
  } catch (err) {
    console.error('❌ Error saving message:', err.message);
  }
});


  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});


//Start the Server
const PORT = process.env.PORT || 5050;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
