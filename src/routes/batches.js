const express = require('express');
const router = express.Router();
const Batch = require('../models/Batch');
const BootcampStudent = require('../models/BootcampStudent');
const { authAdmin } = require('../middleware/auth');

// All 20 batch codes with default fruit mapping
const ALL_BATCHES = [
  { batchCode: 'RedA', fruitName: 'apple' },
  { batchCode: 'RedB', fruitName: 'banana' },
  { batchCode: 'BlueA', fruitName: 'blueberry' },
  { batchCode: 'BlueB', fruitName: 'blackberry' },
  { batchCode: 'PinkA', fruitName: 'cherries' },
  { batchCode: 'PinkB', fruitName: 'dragonfruit' },
  { batchCode: 'PurpleA', fruitName: 'grapes' },
  { batchCode: 'PurpleB', fruitName: 'guava' },
  { batchCode: 'YellowA', fruitName: 'kiwi' },
  { batchCode: 'YellowB', fruitName: 'litchi' },
  { batchCode: 'GreenA', fruitName: 'mango' },
  { batchCode: 'GreenB', fruitName: 'muskmelon' },
  { batchCode: 'OrangeA', fruitName: 'orange' },
  { batchCode: 'OrangeB', fruitName: 'papaya' },
  { batchCode: 'WhiteA', fruitName: 'peach' },
  { batchCode: 'WhiteB', fruitName: 'pear' },
  { batchCode: 'BrownA', fruitName: 'pineapple' },
  { batchCode: 'BrownB', fruitName: 'pomegranate' },
  { batchCode: 'BlackA', fruitName: 'strawberry' },
  { batchCode: 'BlackB', fruitName: 'watermelon' }
];
// ============ ADMIN: Initialize Batches with Fruit Images ============
router.post('/admin/init-fruits', authAdmin, async (req, res) => {
  try {
    console.log('🍉 Initializing batches with fruit images...');
    
    // ✅ BATCH CODE → FRUIT NAME MAPPING
    const BATCH_FRUITS = {
      'BlackA': 'strawberry',
      'BlackB': 'watermelon',
      'BlueA': 'blueberry',
      'BlueB': 'blackberry',
      'BrownA': 'pineapple',
      'BrownB': 'pomegranate',
      'GreenA': 'mango',
      'GreenB': 'muskmelon',
      'OrangeA': 'orange',
      'OrangeB': 'papaya',
      'PinkA': 'cherries',
      'PinkB': 'dragonfruit',
      'PurpleA': 'grapes',
      'PurpleB': 'guava',
      'RedA': 'apple',
      'RedB': 'banana',
      'WhiteA': 'peach',
      'WhiteB': 'pear',
      'YellowA': 'kiwi',
      'YellowB': 'litchi'
    };
    
    let updated = 0;
    let created = 0;
    
    for (const [batchCode, fruitName] of Object.entries(BATCH_FRUITS)) {
      const imageUrl = `/assets/bootcamp/${fruitName}.jpg`;
      
      const exists = await Batch.findOne({ batchCode });
      if (exists) {
        // ✅ UPDATE existing batch with fruit name and image URL
        await Batch.updateOne(
          { batchCode },
          { 
            $set: { 
              fruitName: fruitName,
              imageUrl: imageUrl,
              updatedAt: new Date()
            } 
          }
        );
        updated++;
      } else {
        // ✅ CREATE new batch
        await Batch.create({
          batchCode,
          fruitName,
          imageUrl,
          updatedAt: new Date()
        });
        created++;
      }
    }
    
    console.log(`✅ Updated ${updated} batches, Created ${created} batches`);
    
    res.json({
      message: `✅ ${updated} batches updated, ${created} new batches created with fruit images!`,
      updated,
      created,
      total: updated + created
    });
  } catch (error) {
    console.error('❌ Init fruits error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ INITIALIZE BATCHES (Admin Only) ============
router.post('/admin/init', authAdmin, async (req, res) => {
  try {
    console.log('📨 Initializing batches...');
    
    let created = 0;
    let existing = 0;
    
    for (const batch of ALL_BATCHES) {
      const exists = await Batch.findOne({ batchCode: batch.batchCode });
      if (!exists) {
        await Batch.create(batch);
        created++;
      } else {
        existing++;
      }
    }
    
    console.log(`✅ Created ${created} batches, ${existing} already existed`);
    
    res.json({
      message: `Initialized ${created} new batches, ${existing} already existed`,
      created,
      existing
    });
  } catch (error) {
    console.error('❌ Init batches error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ GET ALL BATCHES WITH IMAGES ============
router.get('/admin/list', authAdmin, async (req, res) => {
  try {
    console.log('📨 Get batches list');
    
    let batches = await Batch.find().sort({ batchCode: 1 });
    
    // If no batches exist, create defaults
    if (batches.length === 0) {
      console.log('⚠️ No batches found, creating defaults...');
      for (const batch of ALL_BATCHES) {
        await Batch.create(batch);
      }
      batches = await Batch.find().sort({ batchCode: 1 });
    }
    
    console.log(`📊 Found ${batches.length} batches`);
    
    res.json({
      count: batches.length,
      batches
    });
  } catch (error) {
    console.error('❌ Get batches error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ UPDATE BATCH IMAGE ============
router.put('/admin/:batchCode', authAdmin, async (req, res) => {
  try {
    const { batchCode } = req.params;
    const { fruitName, imageUrl } = req.body;
    
    console.log(`📨 Update batch: ${batchCode}`);
    console.log(`   Fruit: ${fruitName}, Image: ${imageUrl}`);
    
    const batch = await Batch.findOne({ batchCode });
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    if (fruitName) batch.fruitName = fruitName;
    if (imageUrl) batch.imageUrl = imageUrl;
    batch.updatedAt = new Date();
    
    await batch.save();
    
    console.log(`✅ Batch updated: ${batchCode}`);
    
    res.json({
      message: 'Batch updated successfully!',
      batch
    });
  } catch (error) {
    console.error('❌ Update batch error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ GET BATCH IMAGE (For Mobile App) ============
router.get('/:batchCode', async (req, res) => {
  try {
    const { batchCode } = req.params;
    
    const batch = await Batch.findOne({ batchCode });
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }
    
    res.json({
      batchCode: batch.batchCode,
      fruitName: batch.fruitName,
      imageUrl: batch.imageUrl
    });
  } catch (error) {
    console.error('❌ Get batch error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ GET ALL BATCHES (For Mobile App) ============
router.get('/', async (req, res) => {
  try {
    const batches = await Batch.find().sort({ batchCode: 1 });
    res.json({
      batches: batches.map(b => ({
        batchCode: b.batchCode,
        fruitName: b.fruitName,
        imageUrl: b.imageUrl
      }))
    });
  } catch (error) {
    console.error('❌ Get all batches error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;