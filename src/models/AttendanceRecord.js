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

  // Not present for manually-marked records (professor marking a student who
  // didn't scan) — these fields only apply to actual QR scans.
  studentLocation: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  },
  studentAccuracy: { type: Number, default: null }, // meters

  distanceFromAnchor: { type: Number, default: null }, // meters, computed server-side; null for manual entries

  // 'present'   -> inside the geofence, auto-approved (or manually marked present)
  // 'flagged'   -> borderline distance, needs professor review
  // 'rejected'  -> too far, needs professor review (or stays absent)
  status: {
    type: String,
    enum: ['present', 'flagged', 'rejected'],
    required: true
  },

  // True if the professor tapped this student in the roster instead of
  // the student scanning the QR themselves (e.g. they forgot / had no signal).
  markedManually: { type: Boolean, default: false },

  reviewedByProfessor: { type: Boolean, default: false },
  // Set only once the professor resolves a flagged/rejected entry.
  finalStatus: {
    type: String,
    enum: ['present', 'absent', null],
    default: null
  },

  // A scan/code entry (status present/flagged) only computes eligibility —
  // the record isn't considered "fully marked" until the student also
  // submits the mandatory feedback form for this session. Set to false by
  // routes/attendance.js's /mark endpoint at creation time for present/
  // flagged scans; flipped to true by routes/feedback.js's /submit once
  // their FeedbackResponse is saved. Defaults to true so every other path
  // that creates a record (manual marks by faculty, rejected scans, and
  // any legacy record) is unaffected and never blocked on feedback.
  feedbackCompleted: { type: Boolean, default: true }
});

// One scan per student per session — prevents a student re-scanning
// (accidentally or a forwarded QR) to mark themselves twice.
attendanceRecordSchema.index({ session: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);