const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const { authAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

// ============ PUBLIC: Get events (used by the mobile app) ============
// Supports optional ?status=live|upcoming|past filter
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const events = await Event.find(filter).sort({ date: 1, time: 1 });

    res.json({
      count: events.length,
      events
    });
  } catch (error) {
    console.error('❌ Get events error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Get all events (for admin dashboard table) ============
router.get('/admin/all', authAdmin, async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 });
    res.json({
      count: events.length,
      events
    });
  } catch (error) {
    console.error('❌ Get admin events error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Create event ============
router.post('/admin/create', authAdmin, async (req, res) => {
  try {
    const { name, club, date, time, venue, status, totalTickets } = req.body;

    if (!name || !date || !time || !venue) {
      return res.status(400).json({ error: 'Name, date, time, and venue are required' });
    }

    const event = new Event({
      name,
      club: club || '',
      date,
      time,
      venue,
      status: status || 'upcoming',
      totalTickets: totalTickets === '' || totalTickets === undefined ? null : Number(totalTickets)
    });

    await event.save();
    console.log('✅ Event created:', event.name);

    res.status(201).json({
      message: 'Event created successfully!',
      event
    });
  } catch (error) {
    console.error('❌ Create event error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Update event details ============
router.put('/admin/:id', authAdmin, async (req, res) => {
  try {
    const { name, club, date, time, venue, status, totalTickets } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (name !== undefined) event.name = name;
    if (club !== undefined) event.club = club;
    if (date !== undefined) event.date = date;
    if (time !== undefined) event.time = time;
    if (venue !== undefined) event.venue = venue;
    if (status !== undefined) event.status = status;

    if (totalTickets !== undefined) {
      const parsed = totalTickets === '' || totalTickets === null ? null : Number(totalTickets);

      // Don't let admin set a cap lower than tickets already issued —
      // that would silently invalidate students who already registered.
      if (parsed !== null && parsed < event.ticketsIssued) {
        return res.status(400).json({
          error: `Total tickets can't be less than ${event.ticketsIssued} (already issued)`
        });
      }

      event.totalTickets = parsed;
    }

    event.updatedAt = new Date();

    await event.save();
    console.log('✅ Event updated:', event.name);

    res.json({
      message: 'Event updated successfully!',
      event
    });
  } catch (error) {
    console.error('❌ Update event error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Update ONLY status (the toggle: live / upcoming / past) ============
router.put('/admin/:id/status', authAdmin, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['live', 'upcoming', 'past'].includes(status)) {
      return res.status(400).json({ error: 'Status must be live, upcoming, or past' });
    }

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { $set: { status, updatedAt: new Date() } },
      { new: true, runValidators: true }
    );

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    console.log(`✅ Event "${event.name}" status changed to: ${status}`);

    res.json({
      message: 'Event status updated successfully!',
      event
    });
  } catch (error) {
    console.error('❌ Update event status error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});
// Add this route


// ============ ADMIN: Set how many slots this event has (0-5) ============
// Resizes event.slots to match, keeping existing slot data where possible.
router.put('/admin/:id/slot-count', authAdmin, async (req, res) => {
  try {
    const slotCount = Number(req.body.slotCount);
    if (!Number.isInteger(slotCount) || slotCount < 0 || slotCount > 5) {
      return res.status(400).json({ error: 'slotCount must be an integer between 0 and 5' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const newSlots = [];
    for (let i = 1; i <= slotCount; i++) {
      const existing = event.slots.find((s) => s.number === i);
      newSlots.push(existing || { number: i, time: '', venue: '', status: 'upcoming' });
    }

    event.slotCount = slotCount;
    event.slots = newSlots;
    event.updatedAt = new Date();
    await event.save();

    console.log(`✅ Event "${event.name}" slot count set to ${slotCount}`);
    res.json({ message: 'Slot count updated successfully!', event });
  } catch (error) {
    console.error('❌ Update slot count error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Update one slot's time/venue/status ============
router.put('/admin/:id/slot/:number', authAdmin, async (req, res) => {
  try {
    const number = Number(req.params.number);
    const { time, venue, status } = req.body;

    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const slot = event.slots.find((s) => s.number === number);
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found on this event' });
    }

    if (time !== undefined) slot.time = time;
    if (venue !== undefined) slot.venue = venue;
    if (status !== undefined) {
      if (!['live', 'upcoming', 'past'].includes(status)) {
        return res.status(400).json({ error: 'Status must be live, upcoming, or past' });
      }
      slot.status = status;
    }

    event.updatedAt = new Date();
    await event.save();

    console.log(`✅ Event "${event.name}" slot ${number} updated`);
    res.json({ message: 'Slot updated successfully!', event });
  } catch (error) {
    console.error('❌ Update slot error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});


// routes/events.js
// ============ ADMIN: Upload/replace event cover photo ============
router.post('/admin/:id/upload-image', authAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // relative URL — server ise static serve karega
    const imageUrl = `/uploads/events/${req.file.filename}`;

    const event = await Event.findByIdAndUpdate(
      req.params.id,
      { imageUrl, updatedAt: new Date() },
      { new: true }
    );

    if (!event) return res.status(404).json({ error: 'Event not found' });

    res.json({ message: 'Cover photo uploaded successfully!', imageUrl, event });
  } catch (error) {
    console.error('❌ Upload image error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});
// ============ ADMIN: Delete event ============
router.delete('/admin/:id', authAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    console.log('✅ Event deleted:', event.name);
    res.json({
      message: 'Event deleted successfully!',
      event
    });
  } catch (error) {
    console.error('❌ Delete event error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;