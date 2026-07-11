const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  club: {
    type: String,
    default: '',
    trim: true
  },
  date: {
    type: String,
    required: true,
    trim: true
  },
  time: {
    type: String,
    required: true,
    trim: true
  },
  venue: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    required: true,
    enum: ['live', 'upcoming', 'past'],
    default: 'upcoming'
  },
  // Ticketing system: admin sets a hard cap on how many tickets can ever
  // be issued for this event. null/undefined = no cap (unlimited).
  totalTickets: {
    type: Number,
    default: null,
    min: 0
  },
  // How many tickets have actually been issued so far (auto-incremented
  // whenever a student registers). Never exceeds totalTickets.
  ticketsIssued: {
    type: Number,
    default: 0,
    min: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
eventSchema.index({ status: 1 });
eventSchema.index({ date: 1 });

// ✅ IMPORTANT: Yeh line honi chahiye
module.exports = mongoose.model('Event', eventSchema);