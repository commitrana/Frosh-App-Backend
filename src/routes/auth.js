const express = require('express');
const router = express.Router();
const Society = require('../models/Society');
const Member = require('../models/Member');
const jwt = require('jsonwebtoken');

// Society Login
router.post('/login', async (req, res) => {
  try {
    console.log('📨 Society login request received');
    console.log('📨 Request body:', req.body);
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find society by email
    const society = await Society.findOne({ email });
    if (!society) {
      console.log('❌ Society not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Society found:', society.societyName);
    
    // Use the comparePassword method
    const isMatch = await society.comparePassword(password);
    console.log('🔐 Password match result:', isMatch);
    
    if (!isMatch) {
      console.log('❌ Password does not match');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log('✅ Login successful for:', society.societyName);

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: society._id, 
        email: society.email,
        societyName: society.societyName,
        role: 'society' 
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful!',
      token,
      society: {
        id: society._id,
        societyName: society.societyName,
        email: society.email,
        slots: society.slots || []
      }
    });

  } catch (error) {
    console.error('❌ Society login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.post('/unified-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const member = await Member.findOne({ email });
    if (member) {
      const isMatch = await member.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

      const token = jwt.sign(
        { id: member._id, email: member.email, role: 'member', societyId: member.societyId },
        process.env.JWT_SECRET || 'fallback_secret_key',
        { expiresIn: '7d' }
      );

      return res.json({
        role: 'member',
        token,
        user: {
          _id: member._id, id: member._id, name: member.name, email: member.email,
          branch: member.branch, rollNo: member.rollNo,
          societyName: member.societyName, slotNumber: member.slotNumber,
        },
      });
    }

    const society = await Society.findOne({ email });
    if (society) {
      const isMatch = await society.comparePassword(password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid email or password' });

      const token = jwt.sign(
        { id: society._id, email: society.email, societyName: society.societyName, role: 'society' },
        process.env.JWT_SECRET || 'fallback_secret_key',
        { expiresIn: '7d' }
      );

      return res.json({
        role: 'society',
        token,
        user: { id: society._id, societyName: society.societyName, email: society.email, slots: society.slots || [] },
      });
    }

    // 3. TEMPORARY: not in Member or Society DB yet — real student
    // storage isn't built yet, so let any email/password through as a
    // student for now. REMOVE THIS once real student accounts exist.
    const token = jwt.sign(
      { email, role: 'member', temp: true },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    return res.json({
      role: 'member',
      token,
      user: { name: email.split('@')[0], email },
    });
  } catch (error) {
    console.error('❌ Unified login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;