const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceSession',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  scannedAt: { type: Date, default: Date.now },

  studentLocation: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  studentAccuracy: { type: Number, default: 20 }, // meters

  distanceFromAnchor: { type: Number, required: true }, // meters, computed server-side

  // 'present'   -> inside the geofence, auto-approved
  // 'flagged'   -> borderline distance, needs professor review
  // 'rejected'  -> too far, needs professor review (or stays absent)
  status: {
    type: String,
    enum: ['present', 'flagged', 'rejected'],
    required: true
  },

  reviewedByProfessor: { type: Boolean, default: false },
  // Set only once the professor resolves a flagged/rejected entry.
  finalStatus: {
    type: String,
    enum: ['present', 'absent', null],
    default: null
  }
});

// One scan per student per session — prevents a student re-scanning
// (accidentally or a forwarded QR) to mark themselves twice.
attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
