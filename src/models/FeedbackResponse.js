const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  source: { type: String, enum: ['admin', 'faculty'], required: true },
  order: { type: Number, required: true, min: 1, max: 5 },
  questionText: { type: String, required: true },
  questionType: {
    type: String,
    enum: ['short_answer', 'paragraph', 'multiple_choice', 'checkboxes', 'dropdown', 'linear_scale', 'numerical'],
    required: true
  },
  textValue: { type: String, default: undefined },
  numberValue: { type: Number, default: undefined },
  selectedOptions: { type: [String], default: undefined }
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