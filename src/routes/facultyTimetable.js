const express = require('express');
const router = express.Router();
const FacultyTimetable = require('../models/FacultyTimetable');
const { authAdmin } = require('../middleware/auth');

// ✅ ALL 20 BATCH CODES
const BATCH_CODES = [
  'BlackA', 'BlackB', 'BlueA', 'BlueB', 'BrownA', 'BrownB',
  'GreenA', 'GreenB', 'OrangeA', 'OrangeB', 'PinkA', 'PinkB',
  'PurpleA', 'PurpleB', 'RedA', 'RedB', 'WhiteA', 'WhiteB',
  'YellowA', 'YellowB'
];

// ✅ INIT - Create all batches (Collection automatically creates)
router.post('/admin/init', authAdmin, async (req, res) => {
  try {
    console.log('📨 Initializing faculty timetable...');
    
    let created = 0;
    let existing = 0;

    for (const code of BATCH_CODES) {
      const exists = await FacultyTimetable.findOne({ batchCode: code });
      if (!exists) {
        await FacultyTimetable.create({ 
          batchCode: code, 
          imageUrl: '',
          updatedAt: new Date()
        });
        created++;
        console.log(`✅ Created: ${code}`);
      } else {
        existing++;
        console.log(`ℹ️ Already exists: ${code}`);
      }
    }

    console.log(`✅ Created ${created} new batches, ${existing} already existed`);
    
    res.json({
      success: true,
      message: `Created ${created} new batches, ${existing} already existed`,
      created,
      existing,
      total: BATCH_CODES.length
    });
  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ✅ GET ALL BATCHES
router.get('/admin/list', authAdmin, async (req, res) => {
  try {
    const batches = await FacultyTimetable.find().sort({ batchCode: 1 });
    res.json({
      count: batches.length,
      batches
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ UPDATE BATCH IMAGE (Google Drive Link)
router.put('/admin/:batchCode', authAdmin, async (req, res) => {
  try {
    const { batchCode } = req.params;
    const { imageUrl } = req.body;

    const batch = await FacultyTimetable.findOne({ batchCode });
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    batch.imageUrl = imageUrl || '';
    batch.updatedAt = new Date();
    batch.updatedBy = 'Admin';
    await batch.save();

    res.json({
      success: true,
      message: 'Timetable image updated successfully!',
      batch
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ GET SINGLE BATCH
router.get('/:batchCode', async (req, res) => {
  try {
    const { batchCode } = req.params;
    const batch = await FacultyTimetable.findOne({ batchCode });
    
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    res.json({ batch });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;