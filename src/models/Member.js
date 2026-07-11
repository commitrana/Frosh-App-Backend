const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MemberSchema = new mongoose.Schema({
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
    required: true
  },
  branch: {
    type: String,
    required: true,
    trim: true
  },
  rollNo: {
    type: String,
    required: true,
    trim: true
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
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  verifiedBy: {
    type: String,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: String,
    default: null
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

// Hash password before saving
MemberSchema.pre('save', function(next) {
  const member = this;
  if (!member.isModified('password')) return next();
  if (member.password && member.password.startsWith('$2b$')) return next();
  
  bcrypt.genSalt(10, function(err, salt) {
    if (err) return next(err);
    bcrypt.hash(member.password, salt, function(err, hash) {
      if (err) return next(err);
      member.password = hash;
      next();
    });
  });
});

// Compare password
MemberSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.password && this.password.startsWith('$2b$')) {
    return await bcrypt.compare(candidatePassword, this.password);
  }
  return candidatePassword === this.password;
};

// Indexes
MemberSchema.index({ email: 1 });
MemberSchema.index({ societyId: 1 });
MemberSchema.index({ status: 1 });

module.exports = mongoose.model('Member', MemberSchema);