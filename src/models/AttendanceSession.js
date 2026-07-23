const mongoose = require('mongoose');

const QUESTION_TYPES = [
  'short_answer',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'linear_scale',
  'numerical'
];

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

  // Short code students type in by hand (replaces the old QR token). Chosen
  // from an unambiguous alphabet (no 0/O, 1/I/L) since it's read off a
  // screen/projector. Generated in routes/attendance.js so it can be
  // checked for uniqueness against other currently-active sessions before
  // save — see generateUniqueSessionCode(). Not globally unique forever:
  // once a session ends, its code is free to be reused by a future one.
  attendanceCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },

  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },

  // ---- Session feedback (added on top of attendance) ----
  // Faculty adds exactly 5 questions for this session (only after ending
  // it). Combined with the 5 fixed FeedbackQuestion docs, students answer
  // 10 total once feedback is opened. Each question can be any of
  // QUESTION_TYPES (Google Forms style) instead of always a 1-5 rating.
  feedbackQuestions: {
    type: [
      {
        text: { type: String, required: true, trim: true },
        order: { type: Number, required: true, min: 1, max: 5 },
        type: { type: String, enum: QUESTION_TYPES, required: true, default: 'linear_scale' },
        options: { type: [String], default: [] }, // multiple_choice / checkboxes / dropdown
        scaleMin: { type: Number, default: 1 },     // linear_scale
        scaleMax: { type: Number, default: 5 }       // linear_scale
      }
    ],
    default: []
  },
  // 'not_set' -> faculty hasn't added their 5 questions yet
  // 'open'    -> feedback started, students can submit
  // 'closed'  -> feedback no longer accepting submissions (reserved for future use)
  feedbackStatus: { type: String, enum: ['not_set', 'open', 'closed'], default: 'not_set' },
  feedbackStartedAt: { type: Date, default: null }
});

attendanceSessionSchema.index({ faculty: 1, startedAt: -1 });
// Not unique at the DB level — a code is only guaranteed unique among
// *active* sessions (enforced in the route at creation time). Ended
// sessions may share a code with a later one, so lookups for /mark always
// filter status separately.
attendanceSessionSchema.index({ attendanceCode: 1, status: 1 });

module.exports = mongoose.model('AttendanceSession', attendanceSessionSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;