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

const feedbackQuestionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  order: { type: Number, required: true, min: 1, max: 5 },
  type: { type: String, enum: QUESTION_TYPES, required: true, default: 'linear_scale' },
  // Only used for multiple_choice / checkboxes / dropdown.
  options: { type: [String], default: [] },
  // Only used for linear_scale.
  scaleMin: { type: Number, default: 1 },
  scaleMax: { type: Number, default: 5 }
}, { timestamps: true });

feedbackQuestionSchema.index({ order: 1 }, { unique: true });

module.exports = mongoose.model('FeedbackQuestion', feedbackQuestionSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;