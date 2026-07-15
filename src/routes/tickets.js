const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { authStudent, authAdmin } = require('../middleware/auth');

// ============ STUDENT: Register for an event (issues a ticket) ============
router.post('/register', authStudent, async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // The app only shows the Register button for live events, but that's
    // just UI — nothing stopped someone from calling this endpoint directly
    // for an upcoming/past event. Enforce it here too.
    if (event.status !== 'live') {
      return res.status(400).json({
        error: event.status === 'upcoming'
          ? 'Registration opens once this event goes live.'
          : 'Registration is closed — this event has ended.'
      });
    }

    // Idempotent: if the student already has a ticket for this event,
    // just return it instead of creating a duplicate / erroring out.
    const existing = await Ticket.findOne({ event: eventId, student: req.student.id });
    if (existing) {
      return res.json({
        message: 'You are already registered for this event',
        ticket: existing
      });
    }

    // Enforce the admin-set capacity, if one was set.
    if (event.totalTickets !== null && event.totalTickets !== undefined) {
      if (event.ticketsIssued >= event.totalTickets) {
        return res.status(400).json({ error: 'Sorry, tickets for this event are sold out' });
      }
    }

    const ticket = new Ticket({
      event: eventId,
      student: req.student.id
    });

    await ticket.save();

    // Atomic increment so concurrent registrations can never push the
    // count past totalTickets.
    event.ticketsIssued += 1;
    await event.save();

    console.log(`✅ Ticket issued for event "${event.name}" to student ${req.student.email}`);

    res.status(201).json({
      message: 'Registered successfully! Your ticket is ready.',
      ticket
    });
  } catch (error) {
    // Duplicate key race (two simultaneous requests from the same student)
    if (error.code === 11000) {
      const existing = await Ticket.findOne({ event: req.body.eventId, student: req.student.id });
      return res.json({
        message: 'You are already registered for this event',
        ticket: existing
      });
    }
    console.error('❌ Register for event error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Get all of my tickets (used by the app to show Register vs View Ticket) ============
router.get('/my-tickets', authStudent, async (req, res) => {
  try {
    const tickets = await Ticket.find({ student: req.student.id })
      .populate('event', 'name club date time venue status')
      .sort({ issuedAt: -1 });

    res.json({
      count: tickets.length,
      tickets
    });
  } catch (error) {
    console.error('❌ Get my tickets error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Scan a ticket QR code ============
router.post('/scan', authAdmin, async (req, res) => {
  try {
    const { qrToken } = req.body;

    if (!qrToken) {
      return res.status(400).json({ error: 'qrToken is required' });
    }

    const ticket = await Ticket.findOne({ qrToken })
      .populate('event', 'name date time venue')
      .populate('student', 'name email branch phoneNo rollNo');

    if (!ticket) {
      return res.status(404).json({ error: 'Invalid ticket. This QR code is not recognized.' });
    }

    if (ticket.status === 'used') {
      return res.status(400).json({
        error: 'This ticket has already been scanned.',
        ticket,
        scannedAt: ticket.scannedAt
      });
    }

    ticket.status = 'used';
    ticket.scannedAt = new Date();
    await ticket.save();

    console.log(`✅ Ticket scanned: ${ticket.student?.name} for "${ticket.event?.name}"`);

    res.json({
      message: 'Ticket verified successfully!',
      ticket
    });
  } catch (error) {
    console.error('❌ Scan ticket error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Get ticket stats for an event (issued / scanned / capacity) ============
router.get('/stats/:eventId', authAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const scanned = await Ticket.countDocuments({ event: req.params.eventId, status: 'used' });

    res.json({
      totalTickets: event.totalTickets,
      issued: event.ticketsIssued,
      scanned
    });
  } catch (error) {
    console.error('❌ Get ticket stats error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Get all registrations (tickets) for an event ============
router.get('/event/:eventId', authAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const tickets = await Ticket.find({ event: req.params.eventId })
      .populate('student', 'name email branch phoneNo rollNo')
      .sort({ issuedAt: -1 });

    const pendingCount = tickets.filter((t) => t.status === 'valid').length;
    const checkedInCount = tickets.filter((t) => t.status === 'used').length;

    res.json({
      event: { _id: event._id, name: event.name },
      pendingCount,
      checkedInCount,
      total: tickets.length,
      registrations: tickets
    });
  } catch (error) {
    console.error('❌ Get event registrations error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;