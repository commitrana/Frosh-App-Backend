const mongoose = require('mongoose');
const crypto = require('crypto');

const attendanceSessionSchema = new mongoose.Schema({
  faculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Faculty',
    required: true
  },
  subject: { type: String, required: true, trim: true },
  venue: { type: String, default: '', trim: true },
  day: { type: String, default: '', trim: true },
  slot: { type: String, default: '', trim: true },

  // Professor's location at the moment the session was started — the "anchor"
  // every student's scan gets measured against.
  anchorLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  anchorAccuracy: { type: Number, default: 20 }, // meters, as reported by the professor's device

  // Base geofence radius in meters. Effective radius (used per-scan) also
  // factors in each device's own GPS accuracy — see routes/attendance.js
  radiusMeters: { type: Number, default: 30 },

  // Which bootcamp batches this specific lecture is open to (e.g. ["RedA", "BlueB"]).
  // Empty array = open to every student, regardless of batch (backward compatible
  // with lectures created before batch-restriction existed).
  batches: {
    type: [String],
    default: []
  },

  // Static QR — no rotation for v1. Random + unguessable, embedded in the QR code.
  qrToken: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },

  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null }
});

attendanceSessionSchema.index({ faculty: 1, startedAt: -1 });
attendanceSessionSchema.index({ qrToken: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);