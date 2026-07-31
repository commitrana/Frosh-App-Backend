const mongoose = require('mongoose');

// We only ever store the CONVERTED page images (Supabase URLs) here.
// The original uploaded PDF is never saved anywhere — it lives in memory
// just long enough to be converted, then it's discarded. This is what
// keeps Supabase storage usage small even on a limited/free plan.
const magazineSchema = new mongoose.Schema(
  {
    issueNumber: { type: Number, required: true, unique: true, index: true },
    title: { type: String, default: '' },
    pages: [{ type: String }], // ordered list of image URLs: page-01.jpg, page-02.jpg, ...
    pageCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
    },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Magazine', magazineSchema);