const express = require('express');
const router = express.Router();
const { authSociety } = require('../middleware/auth');

// Save slots
router.post('/', authSociety, async (req, res) => {
  try {
    console.log('📨 Save slots request received');
    console.log('📨 Request body:', req.body);
    
    const { slot1, slot2 } = req.body;
    const society = req.society;

    if (!slot1 && !slot2) {
      return res.status(400).json({ error: 'At least one slot is required' });
    }

    // Update society with new slots
    const slots = [];
    if (slot1 && slot1.members && slot1.members.length > 0) {
      slots.push({
        slotNumber: 1,
        totalMembers: slot1.totalMembers || slot1.members.length,
        members: slot1.members
      });
    }
    if (slot2 && slot2.members && slot2.members.length > 0) {
      slots.push({
        slotNumber: 2,
        totalMembers: slot2.totalMembers || slot2.members.length,
        members: slot2.members
      });
    }

    society.slots = slots;
    await society.save();
    console.log('✅ Slots saved successfully');

    res.json({
      message: 'Slots saved successfully!',
      slots: society.slots
    });
  } catch (error) {
    console.error('❌ Save slots error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get slots
router.get('/', authSociety, async (req, res) => {
  try {
    console.log('📨 Get slots request received');
    const society = req.society;
    
    res.json({
      slots: society.slots || []
    });
  } catch (error) {
    console.error('❌ Get slots error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;