const mongoose = require('mongoose');

const facultyTimetableSchema = new mongoose.Schema({
  batchCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    default: 'Admin'
  }
});

// ✅ Index for faster queries
facultyTimetableSchema.index({ batchCode: 1 });

// ✅ Auto-create collection if not exists
// Mongoose automatically creates collection when first document is inserted

module.exports = mongoose.model('FacultyTimetable', facultyTimetableSchema);