const express = require('express');
const router = express.Router();
const Society = require('../models/Society');
const Admin = require('../models/Admin');
const Member = require('../models/Member');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Admin Login
router.post('/login', async (req, res) => {
  try {
    console.log('📨 Login request received');
    console.log('📨 Request body:', req.body);
    
    const { username, password } = req.body;

    if (!username || !password) {
      console.log('❌ Missing username or password');
      return res.status(400).json({ error: 'Username and password required' });
    }

    console.log('🔍 Looking for admin:', username);
    
    const admin = await Admin.findOne({ username });
    console.log('🔍 Admin found:', admin ? 'Yes' : 'No');
    
    if (!admin) {
      console.log('❌ Admin not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Admin found:', admin.username);
    
    const isMatch = await bcrypt.compare(password, admin.password);
    console.log('🔐 Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    console.log('✅ Password matches! Generating token...');
    
    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    console.log('✅ Login successful for:', admin.username);
    
    res.json({
      message: 'Admin login successful',
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
    
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Admin creates a society account
router.post('/create-society', async (req, res) => {
  try {
    console.log('📨 Create society request received');
    console.log('📨 Request body:', req.body);
    
    const { societyName, email, password } = req.body;

    if (!societyName || !email || !password) {
      console.log('❌ Missing fields');
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      console.log('❌ Password too short');
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await Society.findOne({ 
      $or: [{ email }, { societyName }] 
    });
    
    if (existing) {
      console.log('❌ Society already exists');
      return res.status(400).json({ 
        error: 'Society with this email or name already exists' 
      });
    }

    const society = new Society({
      societyName,
      email,
      password
    });

    await society.save();
    console.log('✅ Society created successfully:', societyName);

    res.status(201).json({
      message: 'Society created successfully!',
      society: {
        id: society._id,
        societyName: society.societyName,
        email: society.email,
        createdAt: society.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Create society error:', error);
    res.status(500).json({ 
      error: 'Server error: ' + error.message 
    });
  }
});

// Admin gets all societies
router.get('/societies', async (req, res) => {
  try {
    console.log('📨 Get societies request received');
    const societies = await Society.find().select('-password').sort({ createdAt: -1 });
    console.log(`📊 Found ${societies.length} societies`);
    res.json({
      count: societies.length,
      societies
    });
  } catch (error) {
    console.error('Get societies error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin updates society password
router.put('/update-password/:id', async (req, res) => {
  try {
    console.log('📨 Update password request for society:', req.params.id);
    
    const { password } = req.body;
    const societyId = req.params.id;

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const society = await Society.findById(societyId);
    if (!society) {
      return res.status(404).json({ error: 'Society not found' });
    }

    society.password = password;
    await society.save();
    console.log('✅ Password updated successfully for:', society.societyName);

    res.json({ 
      message: 'Password updated successfully!',
      society: {
        id: society._id,
        societyName: society.societyName,
        email: society.email
      }
    });
  } catch (error) {
    console.error('❌ Update password error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Admin gets all members of a specific society
router.get('/society-members/:societyId', async (req, res) => {
  try {
    console.log('📨 Get society members request for society:', req.params.societyId);
    
    const { societyId } = req.params;
    
    // Check if society exists
    const society = await Society.findById(societyId);
    if (!society) {
      return res.status(404).json({ error: 'Society not found' });
    }
    
    const members = await Member.find({ societyId }).select('-password').sort({ createdAt: -1 });
    
    console.log(`📊 Found ${members.length} members for society: ${society.societyName}`);
    
    res.json({
      count: members.length,
      members: members.map(m => ({
        _id: m._id,
        id: m._id,
        name: m.name,
        email: m.email,
        branch: m.branch,
        rollNo: m.rollNo,
        slotNumber: m.slotNumber,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Get society members error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Admin gets a specific member by ID (for QR scanning)
router.get('/member/:memberId', async (req, res) => {
  try {
    console.log('📨 Get member by ID request:', req.params.memberId);
    
    const { memberId } = req.params;
    
    const member = await Member.findById(memberId).select('-password');
    if (!member) {
      console.log('❌ Member not found:', memberId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    console.log('✅ Member found:', member.name, member.email);
    
    res.json({
      member: {
        id: member._id,
        name: member.name,
        email: member.email,
        branch: member.branch,
        rollNo: member.rollNo,
        societyName: member.societyName,
        slotNumber: member.slotNumber,
        createdAt: member.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Get member by ID error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Admin deletes a society
router.delete('/delete-society/:id', async (req, res) => {
  try {
    console.log('📨 Delete society request:', req.params.id);
    
    // Find and delete the society
    const society = await Society.findByIdAndDelete(req.params.id);
    
    if (!society) {
      return res.status(404).json({ error: 'Society not found' });
    }

    // Also delete all members associated with this society
    const deletedMembers = await Member.deleteMany({ societyId: req.params.id });
    console.log(`✅ Deleted ${deletedMembers.deletedCount} members associated with society`);

    console.log('✅ Society deleted:', society.societyName);
    res.json({ 
      message: 'Society deleted successfully!',
      society: {
        id: society._id,
        societyName: society.societyName
      }
    });
  } catch (error) {
    console.error('Delete society error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;