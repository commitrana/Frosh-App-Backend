const mongoose = require('mongoose');
const crypto = require('crypto');

const ticketSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  // Unique token embedded in the QR code. Random + unguessable.
  qrToken: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },
  // Which slot (1-5) this ticket is for, if the event has slots.
  // 0 = the event has no slots (booked the plain event).
  slot: {
    type: Number,
    default: 0
  },
  // A ticket can only ever be scanned once: 'valid' -> 'used'.
  status: {
    type: String,
    enum: ['valid', 'used'],
    default: 'valid'
  },
  issuedAt: {
    type: Date,
    default: Date.now
  },
  scannedAt: {
    type: Date,
    default: null
  }
});

// One ticket per student per event — registering twice returns the
// existing ticket instead of creating a duplicate.
ticketSchema.index({ event: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('Ticket', ticketSchema);