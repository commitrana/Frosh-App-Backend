const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');

// Import routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const memberRoutes = require('./routes/member');
const slotsRoutes = require('./routes/slots');
const { authSociety, authAdmin } = require('./middleware/auth');

// Force Node.js to use system DNS
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
console.log('🔄 Connecting to MongoDB Atlas...');

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  family: 4,
  tls: true,
  retryWrites: true,
  w: 'majority',
  connectTimeoutMS: 30000
})
.then(() => {
  console.log('✅ MongoDB Atlas Connected Successfully!');
  console.log('📦 Database: MongoDB Atlas (Cloud)');
})
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err.message);
  console.log('💡 If this fails, try running:');
  console.log('   node --dns-result-order=ipv4first src/server.js');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/member', memberRoutes);
app.use('/api/society/slots', slotsRoutes);

// Protected test routes
app.get('/api/society-profile', authSociety, (req, res) => {
  res.json({
    message: 'Society profile',
    society: {
      id: req.society._id,
      societyName: req.society.societyName,
      email: req.society.email,
      slots: req.society.slots
    }
  });
});

app.get('/api/admin-dashboard', authAdmin, (req, res) => {
  res.json({
    message: 'Admin dashboard',
    admin: {
      id: req.admin.id,
      role: req.admin.role
    }
  });
});

// Test Route
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Backend is working!',
    database: 'MongoDB Atlas',
    status: '✅ Connected to SocietyPortal',
    timestamp: new Date().toISOString()
  });
});

// Database status check route
app.get('/api/db-status', (req, res) => {
  const state = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({
    status: 'success',
    connection: states[state],
    databaseName: mongoose.connection.db?.databaseName || 'unknown',
    host: mongoose.connection.host || 'MongoDB Atlas'
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Society Portal API',
    version: '1.0.0',
    status: '✅ Server is running',
    endpoints: {
      'Public': {
        'GET /': 'API Information',
        'GET /api/test': 'Test connection',
        'GET /api/db-status': 'Check database status',
        'POST /api/auth/login': 'Society Login',
        'POST /api/member/login': 'Member Login'
      },
      'Admin': {
        'POST /api/admin/login': 'Admin Login',
        'POST /api/admin/create-society': 'Create Society',
        'GET /api/admin/societies': 'List All Societies',
        'PUT /api/admin/update-password/:id': 'Update Society Password',
        'DELETE /api/admin/delete-society/:id': 'Delete Society',
        'GET /api/admin/society-members/:societyId': 'Get Society Members'
      },
      'Society (Auth Required)': {
        'POST /api/member/create': 'Create Members',
        'GET /api/member/society-members': 'Get Society Members',
        'DELETE /api/member/delete/:memberId': 'Delete Member',
        'GET /api/society/slots': 'Get Slots',
        'POST /api/society/slots': 'Save Slots',
        'GET /api/society-profile': 'Get Society Profile'
      },
      'Member (Auth Required)': {
        'GET /api/member/profile': 'Get Member Profile'
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 API test: http://localhost:${PORT}/api/test`);
  console.log(`📊 DB Status: http://localhost:${PORT}/api/db-status`);
  console.log(`📝 Admin Login: POST http://localhost:${PORT}/api/admin/login`);
  console.log(`🔐 Society Login: POST http://localhost:${PORT}/api/auth/login`);
  console.log(`👤 Member Login: POST http://localhost:${PORT}/api/member/login`);
  console.log(`📊 All endpoints: http://localhost:${PORT}/`);
});