const express = require('express');
const router = express.Router();
const multer = require('multer');
const TeamMember = require('../models/TeamMember');
const adminAuth = require('../middleware/adminAuth');
const { uploadToImageHost, deleteFromImageHost } = require('../utils/supabaseUpload');

// This single router is mounted at TWO base paths in server.js (see the
// setup notes) — '/api/team' for the public GET, and '/api/admin/team' for
// the protected upload/edit/delete routes. Each route still has its own
// adminAuth middleware, so nothing protected becomes accessible just
// because of the double mount.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB raw upload cap, pre-compression
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

const VALID_CATEGORIES = ['faculty', 'osc', 'core', 'mentor'];

// POST /api/admin/team/upload  (protected)
// multipart/form-data: category, name, branch?, designation?, order?, image
router.post('/upload', adminAuth, upload.single('image'), async (req, res) => {
  try {
    console.log('📨 Team upload request received');

    const { category, name, branch, designation, order } = req.body;

    if (!category || !name) {
      return res.status(400).json({ error: 'Category and name are required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const { url, path } = await uploadToImageHost(req.file.buffer);

    const member = new TeamMember({
      category,
      name,
      branch: branch || '',
      designation: designation || '',
      imageUrl: url,
      imagePath: path,
      order: order ? Number(order) : 0,
    });

    await member.save();
    console.log('✅ Team member added:', member.name, `(${member.category})`);

    res.status(201).json({
      message: 'Team member added successfully!',
      member,
    });
  } catch (error) {
    console.error('❌ Team upload error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// GET /api/team  (public — the app uses this)
router.get('/', async (req, res) => {
  try {
    const members = await TeamMember.find().sort({ category: 1, order: 1, createdAt: 1 });

    const grouped = { faculty: [], osc: [], core: [], mentor: [] };
    members.forEach((m) => {
      grouped[m.category].push({
        id: m._id,
        name: m.name,
        branch: m.branch,
        designation: m.designation,
        imageUrl: m.imageUrl,
        order: m.order,
      });
    });

    res.json(grouped);
  } catch (error) {
    console.error('❌ Get team error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/admin/team/:id  (protected — edit name/branch/designation/order,
// not the photo; re-upload via a new POST + delete the old one if the photo
// itself needs replacing, keeps this endpoint simple)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { name, branch, designation, order, category } = req.body;

    if (category && !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const update = {};
    if (name !== undefined) update.name = name;
    if (branch !== undefined) update.branch = branch;
    if (designation !== undefined) update.designation = designation;
    if (order !== undefined) update.order = Number(order);
    if (category !== undefined) update.category = category;

    const member = await TeamMember.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    res.json({ message: 'Team member updated successfully!', member });
  } catch (error) {
    console.error('❌ Update team member error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// DELETE /api/admin/team/:id  (protected)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const member = await TeamMember.findByIdAndDelete(req.params.id);
    if (!member) return res.status(404).json({ error: 'Team member not found' });

    await deleteFromImageHost(member.imagePath);
    console.log('✅ Team member deleted:', member.name);

    res.json({ message: 'Team member deleted successfully!' });
  } catch (error) {
    console.error('❌ Delete team member error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;