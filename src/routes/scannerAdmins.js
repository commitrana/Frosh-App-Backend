const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ScannerAdmin = require('../models/ScannerAdmin');
const { authAdmin } = require('../middleware/auth');

// ============ MAIN ADMIN: Create a scanner admin user ============
router.post('/', authAdmin, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await ScannerAdmin.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: 'A scanner admin with this email already exists' });
    }

    const scannerAdmin = new ScannerAdmin({ name, email, password });
    await scannerAdmin.save();

    console.log('✅ Scanner admin created:', scannerAdmin.email);

    res.status(201).json({
      message: 'Scanner admin created successfully!',
      scannerAdmin: {
        _id: scannerAdmin._id,
        name: scannerAdmin.name,
        email: scannerAdmin.email,
        createdAt: scannerAdmin.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Create scanner admin error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ MAIN ADMIN: List all scanner admins ============
router.get('/', authAdmin, async (req, res) => {
  try {
    const scannerAdmins = await ScannerAdmin.find().select('-password').sort({ createdAt: -1 });
    res.json({ count: scannerAdmins.length, scannerAdmins });
  } catch (error) {
    console.error('❌ Get scanner admins error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ MAIN ADMIN: Delete a scanner admin ============
router.delete('/:id', authAdmin, async (req, res) => {
  try {
    const scannerAdmin = await ScannerAdmin.findByIdAndDelete(req.params.id);
    if (!scannerAdmin) {
      return res.status(404).json({ error: 'Scanner admin not found' });
    }
    console.log('✅ Scanner admin deleted:', scannerAdmin.email);
    res.json({ message: 'Scanner admin deleted successfully!' });
  } catch (error) {
    console.error('❌ Delete scanner admin error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ PUBLIC: Scanner admin login (used by the Frosh Ticketing site) ============
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const scannerAdmin = await ScannerAdmin.findOne({ email: email.toLowerCase().trim() });
    if (!scannerAdmin) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await new Promise((resolve, reject) => {
      scannerAdmin.comparePassword(password, (err, match) => {
        if (err) reject(err);
        else resolve(match);
      });
    });

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: scannerAdmin._id, role: 'scanner', name: scannerAdmin.name, email: scannerAdmin.email },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '30d' }
    );

    console.log('✅ Scanner admin logged in:', scannerAdmin.email);

    res.json({
      message: 'Login successful!',
      token,
      scannerAdmin: { id: scannerAdmin._id, name: scannerAdmin.name, email: scannerAdmin.email }
    });
  } catch (error) {
    console.error('❌ Scanner admin login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;