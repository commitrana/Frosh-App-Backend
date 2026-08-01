const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// A "Scanner Admin" is a lightweight account created by the main Admin
// Panel (via the Admin Panel -> Scanner Admins button) that can ONLY log
// into the separate ticketing site and scan/view tickets. It cannot
// create, edit, or delete events, students, societies, etc.
const ScannerAdminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving — identical pattern to Admin.js
ScannerAdminSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method — identical pattern to Admin.js
ScannerAdminSchema.methods.comparePassword = function (candidatePassword, callback) {
  bcrypt.compare(candidatePassword, this.password, function (err, isMatch) {
    if (err) return callback(err);
    callback(null, isMatch);
  });
};

module.exports = mongoose.model('ScannerAdmin', ScannerAdminSchema);