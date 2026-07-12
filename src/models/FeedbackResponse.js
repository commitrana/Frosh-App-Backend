const mongoose = require('mongoose');

// One document per student per session. Answers array always has exactly
// 10 entries: 5 with source 'admin' (order 1-5) + 5 with source 'faculty'
// (order 1-5) — matching AttendanceSession.feedbackQuestions and
// FeedbackQuestion at submit time, so the question text is preserved even
// if the fixed questions are edited later.
const answerSchema = new mongoose.Schema({
  source: { type: String, enum: ['admin', 'faculty'], required: true },
  order: { type: Number, required: true, min: 1, max: 5 },
  questionText: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', trim: true }
}, { _id: false });

const feedbackResponseSchema = new mongoose.Schema({
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
  answers: {
    type: [answerSchema],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length === 10,
      message: 'Feedback must include exactly 10 answers (5 admin + 5 faculty questions).'
    }
  },
  submittedAt: { type: Date, default: Date.now }
});

// One submission per student per session.
feedbackResponseSchema.index({ session: 1, student: 1 }, { unique: true });

module.exports = mongoose.model('FeedbackResponse', feedbackResponseSchema);
