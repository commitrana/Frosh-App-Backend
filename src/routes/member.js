const express = require('express');
const router = express.Router();
const Member = require('../models/Member');
const jwt = require('jsonwebtoken');
const { authSociety, authMember } = require('../middleware/auth');

// Society creates members (protected - society only)
router.post('/create', authSociety, async (req, res) => {
  try {
    console.log('📨 Create member request received');
    console.log('📨 Request body:', req.body);
    
    const { members, slotNumber } = req.body;
    const society = req.society;

    if (!members || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: 'Members array is required' });
    }

    if (!slotNumber || ![1, 2].includes(slotNumber)) {
      return res.status(400).json({ error: 'Valid slot number is required (1 or 2)' });
    }

    const createdMembers = [];
    const errors = [];

    for (const memberData of members) {
      const { name, branch, rollNo, email, password } = memberData;

      if (!name || !branch || !rollNo || !email || !password) {
        errors.push({ email: email || 'unknown', error: 'All fields are required' });
        continue;
      }

      if (password.length < 6) {
        errors.push({ email, error: 'Password must be at least 6 characters' });
        continue;
      }

      const existing = await Member.findOne({ email });
      if (existing) {
        errors.push({ email, error: 'Member with this email already exists' });
        continue;
      }

      const member = new Member({
        name,
        branch,
        rollNo,
        email,
        password,
        societyId: society._id,
        societyName: society.societyName,
        slotNumber
      });

      await member.save();
      createdMembers.push(member);
      console.log('✅ Member created:', email);
    }

    res.status(201).json({
      message: `Created ${createdMembers.length} members successfully`,
      created: createdMembers.map(m => ({
        _id: m._id,
        id: m._id,
        name: m.name,
        email: m.email,
        branch: m.branch,
        rollNo: m.rollNo,
        slotNumber: m.slotNumber
      })),
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Create member error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Member Login
router.post('/login', async (req, res) => {
  try {
    console.log('📨 Member login request received');
    console.log('📨 Request body:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const member = await Member.findOne({ email });
    if (!member) {
      console.log('❌ Member not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Member found:', member.email);
    
    const isMatch = await member.comparePassword(password);
    console.log('🔐 Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Login successful for:', member.email);

    const token = jwt.sign(
      { 
        id: member._id, 
        email: member.email,
        role: 'member',
        societyId: member.societyId
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful!',
      token,
      member: {
        _id: member._id,
        id: member._id,
        name: member.name,
        email: member.email,
        branch: member.branch,
        rollNo: member.rollNo,
        societyName: member.societyName,
        slotNumber: member.slotNumber
      }
    });

  } catch (error) {
    console.error('❌ Member login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get member profile (protected - member only)
router.get('/profile', authMember, async (req, res) => {
  try {
    const member = await Member.findById(req.member.id).select('-password');
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    res.json({
      member: {
        _id: member._id,
        id: member._id,
        name: member.name,
        email: member.email,
        branch: member.branch,
        rollNo: member.rollNo,
        societyName: member.societyName,
        slotNumber: member.slotNumber,
        status: member.status || 'pending',
        verifiedAt: member.verifiedAt || null,
        verifiedBy: member.verifiedBy || null,
        rejectedAt: member.rejectedAt || null,
        rejectedBy: member.rejectedBy || null,
        createdAt: member.createdAt
      }
    });

  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get members by society (for society dashboard)
router.get('/society-members', authSociety, async (req, res) => {
  try {
    const society = req.society;
    const members = await Member.find({ societyId: society._id }).select('-password');
    
    console.log('📊 Found members:', members.map(m => ({ _id: m._id, name: m.name })));
    
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
        status: m.status || 'pending',
        verifiedAt: m.verifiedAt || null,
        verifiedBy: m.verifiedBy || null,
        rejectedAt: m.rejectedAt || null,
        rejectedBy: m.rejectedBy || null,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Get society members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a member (society only)
router.delete('/delete/:memberId', authSociety, async (req, res) => {
  try {
    console.log('📨 Delete member request received');
    console.log('📨 Member ID:', req.params.memberId);
    console.log('📨 Society:', req.society.societyName);
    
    const { memberId } = req.params;
    const society = req.society;

    if (!memberId) {
      return res.status(400).json({ error: 'Member ID is required' });
    }

    const member = await Member.findById(memberId);
    if (!member) {
      console.log('❌ Member not found:', memberId);
      return res.status(404).json({ error: 'Member not found' });
    }

    console.log('🔍 Found member:', member.name, member.email);

    if (member.societyId.toString() !== society._id.toString()) {
      console.log('❌ Member does not belong to this society');
      return res.status(403).json({ error: 'You can only delete members of your own society' });
    }

    await Member.findByIdAndDelete(memberId);
    console.log('✅ Member deleted:', member.email);

    res.json({ 
      success: true,
      message: 'Member deleted successfully!',
      member: {
        _id: member._id,
        id: member._id,
        name: member.name,
        email: member.email
      }
    });
  } catch (error) {
    console.error('❌ Delete member error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;