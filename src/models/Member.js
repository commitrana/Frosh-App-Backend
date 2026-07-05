const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  societyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Society',
    required: true
  },
  societyName: {
    type: String,
    required: true
  },
  slotNumber: {
    type: Number,
    required: true,
    enum: [1, 2]
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

MemberSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  if (this.password && this.password.startsWith('$2b$')) return;

  console.log('🔐 Hashing password for member:', this.email);
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  console.log('🔐 Hash created for member:', this.email);
});

// Compare password method
MemberSchema.methods.comparePassword = function(candidatePassword) {
  return new Promise((resolve, reject) => {
    if (this.password && this.password.startsWith('$2b$')) {
      bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return reject(err);
        resolve(isMatch);
      });
    } else {
      resolve(candidatePassword === this.password);
    }
  });
};

module.exports = mongoose.model('Member', MemberSchema);