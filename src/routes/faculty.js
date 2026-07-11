const express = require('express');
const router = express.Router();
const Faculty = require('../models/Faculty');
const { authAdmin } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

// ============ ADMIN: Create Faculty ============
router.post('/admin/create', authAdmin, async (req, res) => {
  try {
    console.log('📨 Create faculty request received');
    console.log('📨 Request body:', req.body);
    
    const { name, email, password, department, phoneNo, photo, teacherNo, timetableImage } = req.body;

    if (!name || !email || !password || !department || !phoneNo) {
      return res.status(400).json({ 
        error: 'All fields are required: name, email, password, department, phoneNo' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await Faculty.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'Faculty with this email already exists' });
    }

    const faculty = new Faculty({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      department: department.trim(),
      phoneNo: phoneNo.trim(),
      photo: photo || '',
      teacherNo: teacherNo || '',
      timetableImage: timetableImage || '',
      timetable: { schedule: [] }
    });

    await faculty.save();
    console.log('✅ Faculty created successfully:', faculty.name);

    res.status(201).json({
      message: 'Faculty created successfully!',
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email,
        password: faculty.plainPassword,
        department: faculty.department,
        phoneNo: faculty.phoneNo,
        photo: faculty.photo,
        teacherNo: faculty.teacherNo,
        timetableImage: faculty.timetableImage,
        timetable: faculty.timetable,
        createdAt: faculty.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Create faculty error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Get All Faculty ============
router.get('/admin/list', authAdmin, async (req, res) => {
  try {
    console.log('📨 Get faculty list request received');
    const faculty = await Faculty.find().sort({ name: 1 });
    console.log(`📊 Found ${faculty.length} faculty members`);
    
    res.json({
      count: faculty.length,
      faculty: faculty.map(f => ({
        _id: f._id,
        name: f.name,
        email: f.email,
        password: f.plainPassword || '',
        department: f.department,
        phoneNo: f.phoneNo,
        photo: f.photo,
        teacherNo: f.teacherNo || '',
        timetableImage: f.timetableImage || '',
        timetable: f.timetable,
        createdAt: f.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Get faculty list error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Update Faculty ============
router.put('/admin/:id', authAdmin, async (req, res) => {
  try {
    console.log('📨 Update faculty request:', req.params.id);
    console.log('📨 Update data:', req.body);
    
    const { name, email, department, phoneNo, photo, password, teacherNo, timetableImage, timetable } = req.body;
    const facultyId = req.params.id;

    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    if (name) faculty.name = name.trim();
    if (email) faculty.email = email.toLowerCase().trim();
    if (department) faculty.department = department.trim();
    if (phoneNo) faculty.phoneNo = phoneNo.trim();
    if (photo) faculty.photo = photo;
    if (teacherNo !== undefined) faculty.teacherNo = teacherNo;
    if (timetableImage !== undefined) faculty.timetableImage = timetableImage;
    if (timetable) faculty.timetable = timetable;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      faculty.password = password;
    }
    
    faculty.updatedAt = new Date();
    await faculty.save();

    console.log('✅ Faculty updated:', faculty.name);

    res.json({
      message: 'Faculty updated successfully!',
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email,
        password: faculty.plainPassword,
        department: faculty.department,
        phoneNo: faculty.phoneNo,
        photo: faculty.photo,
        teacherNo: faculty.teacherNo,
        timetableImage: faculty.timetableImage,
        timetable: faculty.timetable
      }
    });

  } catch (error) {
    console.error('❌ Update faculty error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Delete Faculty ============
router.delete('/admin/:id', authAdmin, async (req, res) => {
  try {
    console.log('📨 Delete faculty request:', req.params.id);
    
    const faculty = await Faculty.findByIdAndDelete(req.params.id);
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    console.log('✅ Faculty deleted:', faculty.name);
    
    res.json({
      message: 'Faculty deleted successfully!',
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email
      }
    });

  } catch (error) {
    console.error('❌ Delete faculty error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY LOGIN ============
router.post('/login', async (req, res) => {
  try {
    console.log('📨 Faculty login request received');
    console.log('📨 Request body:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const faculty = await Faculty.findOne({ email: email.toLowerCase().trim() });
    if (!faculty) {
      console.log('❌ Faculty not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Faculty found:', faculty.name);
    
    const isMatch = await faculty.comparePassword(password);
    console.log('🔐 Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Faculty login successful:', faculty.email);

    const token = jwt.sign(
      { 
        id: faculty._id, 
        email: faculty.email,
        name: faculty.name,
        role: 'faculty'
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email,
        department: faculty.department,
        phoneNo: faculty.phoneNo,
        photo: faculty.photo,
        teacherNo: faculty.teacherNo || '',
        timetableImage: faculty.timetableImage || '',
        timetable: faculty.timetable || { schedule: [] }
      }
    });

  } catch (error) {
    console.error('❌ Faculty login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Get Profile ============
router.get('/profile', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    if (decoded.role !== 'faculty') {
      return res.status(403).json({ error: 'Faculty access required' });
    }

    const faculty = await Faculty.findById(decoded.id).select('-password');
    if (!faculty) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    res.json({
      faculty: {
        _id: faculty._id,
        name: faculty.name,
        email: faculty.email,
        department: faculty.department,
        phoneNo: faculty.phoneNo,
        photo: faculty.photo,
        teacherNo: faculty.teacherNo || '',
        timetableImage: faculty.timetableImage || '',
        timetable: faculty.timetable || { schedule: [] }
      }
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    console.error('❌ Faculty profile error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;