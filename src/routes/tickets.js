const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { authStudent, authAdmin, authAdminOrScanner } = require('../middleware/auth');

// ============ STUDENT: Register for an event (issues a ticket) ============
router.post('/register', authStudent, async (req, res) => {
  try {
    const { eventId } = req.body;
    let slot = req.body.slot !== undefined ? Number(req.body.slot) : 0;

    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.slotCount && event.slotCount > 0) {
      // Slotted event: the student must pick one of the defined slots, and
      // that specific slot must be live (event.status itself is ignored).
      if (!Number.isInteger(slot) || slot < 1 || slot > event.slotCount) {
        return res.status(400).json({ error: 'Please select a valid slot for this event.' });
      }
      const slotDef = event.slots.find((s) => s.number === slot);
      if (!slotDef) {
        return res.status(400).json({ error: 'Selected slot does not exist for this event.' });
      }
      if (slotDef.status !== 'live') {
        return res.status(400).json({
          error: slotDef.status === 'upcoming'
            ? 'Registration opens once this slot goes live.'
            : 'Registration is closed — this slot has ended.'
        });
      }
    } else {
      // No slots: behaves exactly as before.
      slot = 0;
      if (event.status !== 'live') {
        return res.status(400).json({
          error: event.status === 'upcoming'
            ? 'Registration opens once this event goes live.'
            : 'Registration is closed — this event has ended.'
        });
      }
    }

    // Idempotent + the constraint the admin asked for: one ticket per
    // student per event, period — regardless of which slot, so a student
    // who already booked slot 1 can't also book slot 2 (or vice versa).
    // The schema's unique {event, student} index enforces this even
    // under a race; this check just gives a friendly response first.
    const existing = await Ticket.findOne({ event: eventId, student: req.student.id });
    if (existing) {
      return res.json({
        message: 'You are already registered for this event',
        ticket: existing
      });
    }

    // ---- Atomically reserve a seat BEFORE creating the ticket ----
    // Previously this was "read ticketsIssued -> compare -> save ticket ->
    // ticketsIssued += 1 -> save event", which is a read-modify-write race:
    // two concurrent requests can both read the same ticketsIssued value,
    // both pass the capacity check, both save their own ticket, and then
    // both write back the SAME incremented value — one increment gets
    // silently lost. That's what caused the counter to under-count real
    // tickets (e.g. 130 actual tickets but only 128 shown), and is also
    // what let bookings slip past totalTickets on the last seat.
    //
    // findOneAndUpdate with a $expr guard is a single atomic operation at
    // the database level: MongoDB will only apply the $inc if the
    // condition still holds AT THE MOMENT OF THE WRITE, so two concurrent
    // requests can never both succeed on the last remaining ticket.
    const hasCapacity = event.totalTickets !== null && event.totalTickets !== undefined;
    let reservedEvent = event;

    if (hasCapacity) {
      reservedEvent = await Event.findOneAndUpdate(
        {
          _id: eventId,
          $expr: { $lt: ['$ticketsIssued', '$totalTickets'] }
        },
        { $inc: { ticketsIssued: 1 } },
        { new: true }
      );
      if (!reservedEvent) {
        return res.status(400).json({ error: 'Sorry, tickets for this event are sold out' });
      }
    } else {
      // No capacity limit set — still increment atomically so the
      // "issued" counter never drifts out of sync with real tickets.
      reservedEvent = await Event.findByIdAndUpdate(
        eventId,
        { $inc: { ticketsIssued: 1 } },
        { new: true }
      );
    }

    let ticket;
    try {
      ticket = new Ticket({
        event: eventId,
        student: req.student.id,
        slot
      });
      await ticket.save();
    } catch (err) {
      // Ticket creation failed after we already reserved a seat —
      // give the seat back so the counter stays accurate.
      await Event.findByIdAndUpdate(eventId, { $inc: { ticketsIssued: -1 } });

      // Duplicate key race: same student double-submitted at the same
      // instant and the other request's ticket already exists.
      if (err.code === 11000) {
        const existingAfterRace = await Ticket.findOne({ event: eventId, student: req.student.id });
        return res.json({
          message: 'You are already registered for this event',
          ticket: existingAfterRace
        });
      }
      throw err;
    }

    console.log(`✅ Ticket issued for event "${event.name}"${slot ? ` (slot ${slot})` : ''} to student ${req.student.email}`);

    res.status(201).json({
      message: 'Registered successfully! Your ticket is ready.',
      ticket
    });
  } catch (error) {
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
router.post('/scan', authAdminOrScanner, async (req, res) => {
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
router.get('/stats/:eventId', authAdminOrScanner, async (req, res) => {
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
router.get('/event/:eventId', authAdminOrScanner, async (req, res) => {
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