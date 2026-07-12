const mongoose = require('mongoose');

// The 5 fixed, global questions set by the admin (from the Faculty page's
// Feedback section). Every session's feedback form includes these 5 plus
// the faculty's own 5 session-specific questions (10 total).
// We enforce "exactly 5" at the route level, not the schema level, since a
// single document (order 1-5) is simpler to update than a growing array.
const feedbackQuestionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 1, max: 5 }
}, { timestamps: true });

feedbackQuestionSchema.index({ order: 1 }, { unique: true });

module.exports = mongoose.model('FeedbackQuestion', feedbackQuestionSchema);
