const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
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

// Hash password before saving - FIXED VERSION
AdminSchema.pre('save', function(next) {
  const admin = this;
  
  if (!admin.isModified('password')) return next();
  
  console.log('🔐 Hashing password for admin...');
  
  bcrypt.genSalt(10, function(err, salt) {
    if (err) return next(err);
    
    bcrypt.hash(admin.password, salt, function(err, hash) {
      if (err) return next(err);
      
      admin.password = hash;
      console.log('🔐 Hash created:', admin.password.substring(0, 20) + '...');
      next();
    });
  });
});

// Compare password method
AdminSchema.methods.comparePassword = function(candidatePassword, callback) {
  bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
    if (err) return callback(err);
    callback(null, isMatch);
  });
};

module.exports = mongoose.model('Admin', AdminSchema);