const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const admin = require('firebase-admin');
const debounce = require('lodash/debounce');
const helmet = require('helmet'); // Security headers ke liye

// Firebase Admin SDK initialize karo
try {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_ADMIN_SDK_JSON)),
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
  process.exit(1); // Server crash kar do agar Firebase initialize nahi hua
}

const db = admin.firestore();

// Security headers add karo
app.use(helmet());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`A user connected: ${socket.id} at ${new Date().toISOString()}`);

  const broadcastChanges = debounce(({ docId, delta }) => {
    try {
      if (!docId || !delta) {
        throw new Error('Invalid docId or delta');
      }
      console.log(`Broadcasted changes to doc ${docId}:`, JSON.stringify(delta));
      socket.to(docId).emit('receive-changes', delta);
    } catch (error) {
      console.error(`Error broadcasting changes for doc ${docId}:`, error.message);
    }
  }, 500, { leading: false, trailing: true });

  socket.on('join-doc', (docId) => {
    try {
      if (!docId) {
        throw new Error('docId is required');
      }
      console.log(`User ${socket.id} joined doc: ${docId} at ${new Date().toISOString()}`);
      socket.join(docId);
      socket.emit('joined', `Successfully joined doc: ${docId}`);
    } catch (error) {
      console.error(`Error in join-doc for socket ${socket.id}:`, error.message);
      socket.emit('error', { message: 'Failed to join document' });
    }
  });

  socket.on('send-changes', ({ docId, delta }) => {
    try {
      if (!docId || !delta) {
        throw new Error('docId and delta are required');
      }
      console.log(`Received changes for doc ${docId} from ${socket.id}:`, JSON.stringify(delta));
      broadcastChanges({ docId, delta });
    } catch (error) {
      console.error(`Error in send-changes for socket ${socket.id}:`, error.message);
      socket.emit('error', { message: 'Failed to send changes' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id} at ${new Date().toISOString()}`);
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error.message);
  });
});

// Server start karo
const PORT = process.env.PORT || 5000;
http.listen(PORT, () => {
  console.log(`Socket.IO server running on port ${PORT} at ${new Date().toISOString()}`);
});