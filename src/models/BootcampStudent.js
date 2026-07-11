const mongoose = require('mongoose');

// A separate roster for the bootcamp — imported via CSV. Deliberately NOT
// the same collection as Student: a bootcamp entry might or might not
// correspond to a real enrolled student (that's what "verified" checks).
const bootcampStudentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true
  },
  phoneNo: {
    type: String,
    default: '',
    trim: true
  },
  // One of the 20 batch codes (RedA, RedB, BlueA, ...). Many students can
  // share the same batch — it's a group, not a unique-per-student code.
  batch: {
    type: String,
    default: null,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

bootcampStudentSchema.index({ batch: 1 });

module.exports = mongoose.model('BootcampStudent', bootcampStudentSchema);