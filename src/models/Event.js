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
  },
  imageUrl: {           // Public Supabase Storage URL for the event cover photo
    type: String,
    default: null
  },
  // Storage path (not the URL) within the Supabase bucket — kept so the old
  // file can be deleted whenever the event's photo is replaced or the event
  // itself is deleted, same pattern as TeamMember.imagePath.
  imagePath: {
    type: String,
    default: null
  },
  // ---- Slots (optional sub-sessions within one event) ----
  // 0 = no slots, the event behaves exactly as before (single date/time/venue/status).
  // 1-5 = the app shows a slot picker instead, each slot with its own
  // time/venue/status. Ticket capacity/count stay shared at the event level.
  slotCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  slots: {
    type: [
      {
        number: { type: Number, required: true, min: 1, max: 5 },
        time: { type: String, default: '', trim: true },
        venue: { type: String, default: '', trim: true },
        status: { type: String, enum: ['live', 'upcoming', 'past'], default: 'upcoming' }
      }
    ],
    default: []
  },
});

// Indexes
eventSchema.index({ status: 1 });
eventSchema.index({ date: 1 });

// ✅ IMPORTANT: Yeh line honi chahiye
module.exports = mongoose.model('Event', eventSchema);