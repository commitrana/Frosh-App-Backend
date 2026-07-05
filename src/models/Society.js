const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Member Schema (nested inside Slot)
const MemberSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  branch: {
    type: String,
    required: true,
    enum: ['CSE', 'ECE', 'ME', 'CE', 'EE', 'IT', 'Other']
  },
  rollNo: {
    type: String,
    required: true,
    trim: true
  }
});

// Slot Schema (nested inside Society)
const SlotSchema = new mongoose.Schema({
  slotNumber: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4, 5]
  },
  totalMembers: {
    type: Number,
    required: true,
    min: 1
  },
  members: [MemberSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Main Society Schema - NO isVerified field
const SocietySchema = new mongoose.Schema({
  societyName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  slots: [SlotSchema],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

SocietySchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (this.password && this.password.startsWith('$2b$')) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});
// Compare password method - SUPPORTS BOTH HASHED AND PLAIN TEXT
SocietySchema.methods.comparePassword = function(candidatePassword) {
  return new Promise((resolve, reject) => {
    // Check if stored password is hashed
    if (this.password && this.password.startsWith('$2b$')) {
      // Hashed password - use bcrypt
      console.log('🔐 Comparing hashed password...');
      bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return reject(err);
        console.log('🔐 Hash comparison result:', isMatch);
        resolve(isMatch);
      });
    } else {
      // Plain text password - direct comparison
      console.log('🔐 Comparing plain text password...');
      console.log('🔑 Stored (plain):', this.password);
      console.log('🔐 Entered:', candidatePassword);
      const isMatch = (candidatePassword === this.password);
      console.log('🔐 Plain comparison result:', isMatch);
      resolve(isMatch);
    }
  });
};

module.exports = mongoose.model('Society', SocietySchema);