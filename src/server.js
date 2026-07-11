const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('dns');
const facultyRoutes = require('./routes/faculty');
const batchRoutes = require('./routes/batches');
const attendanceRoutes = require('./routes/attendance');

// Import routes - these are in the src/routes folder
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const memberRoutes = require('./routes/member');
const slotsRoutes = require('./routes/slots');
const studentRoutes = require('./routes/students');  // Student routes in src/routes/
const eventRoutes = require('./routes/events');
const ticketRoutes = require('./routes/tickets');
const bootcampRoutes = require('./routes/bootcamp');
const { authSociety, authAdmin } = require('./middleware/auth');
const facultyTimetableRoutes = require('./routes/facultyTimetable');

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
app.use('/api/admin', studentRoutes);  // Student routes will be under /api/admin
app.use('/api/events', eventRoutes);   // Public GET for app, /api/events/admin/* for admin management
app.use('/api/tickets', ticketRoutes); // Student register/my-tickets, Admin scan/stats
app.use('/api/bootcamp', bootcampRoutes); // Batch assignment: admin manage, student my-batch
app.use('/api/faculty', facultyRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/attendance', attendanceRoutes); // Faculty: session start/live/flagged/review/end, Student: active/mark
app.use('/api/faculty-timetable', facultyTimetableRoutes);
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
        'POST /api/member/login': 'Member Login',
        'GET /api/events': 'Get All Events (app) - supports ?status=live|upcoming|past'
      },
      'Admin': {
        'POST /api/admin/login': 'Admin Login',
        'POST /api/admin/create-society': 'Create Society',
        'GET /api/admin/societies': 'List All Societies',
        'PUT /api/admin/update-password/:id': 'Update Society Password',
        'DELETE /api/admin/delete-society/:id': 'Delete Society',
        'GET /api/admin/society-members/:societyId': 'Get Society Members',
        // Student management endpoints
        'GET /api/admin/students': 'Get All Students (with pagination)',
        'GET /api/admin/students/all': 'Get All Students (no pagination)',
        'PUT /api/admin/students/:id': 'Update Student',
        'PUT /api/admin/students/bulk': 'Bulk Update Students',
        'DELETE /api/admin/students/:id': 'Delete Student',
        'DELETE /api/admin/students/bulk': 'Bulk Delete Students',
        'GET /api/admin/students/export': 'Export Students to CSV',
        'POST /api/admin/students/import': 'Import Students from CSV',
        // Event management endpoints
        'GET /api/events/admin/all': 'Get All Events (admin)',
        'POST /api/events/admin/create': 'Create Event',
        'PUT /api/events/admin/:id': 'Update Event',
        'PUT /api/events/admin/:id/status': 'Update Event Status (live/upcoming/past)',
        'DELETE /api/events/admin/:id': 'Delete Event',
        // Ticketing endpoints
        'POST /api/tickets/scan': 'Scan a student ticket QR code',
        'GET /api/tickets/stats/:eventId': 'Get ticket stats for an event (issued/scanned/capacity)',
        'GET /api/tickets/event/:eventId': 'Get all registrations (tickets) for an event',
        // Bootcamp endpoints
        'GET /api/bootcamp/admin/batches': 'Get the list of all 20 batch codes',
        'GET /api/bootcamp/admin/list': 'Get the full bootcamp roster (with verified flag)',
        'POST /api/bootcamp/admin/import': 'Bulk import bootcamp roster from CSV (name, email, phoneNo, batch)',
        'POST /api/bootcamp/admin/shuffle': 'Randomly redistribute everyone in the roster across the 20 batches',
        'PUT /api/bootcamp/admin/:id': "Edit a bootcamp student's batch"
      },
      'Student (Auth Required)': {
        'POST /api/tickets/register': 'Register for an event (issues a ticket)',
        'GET /api/tickets/my-tickets': 'Get all of my tickets',
        'GET /api/bootcamp/my-batch': 'Get my bootcamp batch'
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
app.use('/api/faculty-timetable', facultyTimetableRoutes);

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
  console.log(`👨‍🎓 Student endpoints: http://localhost:${PORT}/api/admin/students`);
});