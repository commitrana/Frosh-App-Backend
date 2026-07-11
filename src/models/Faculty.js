const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const facultySchema = new mongoose.Schema({
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
  // Plain-text copy kept ONLY for admin panel visibility.
  // The `password` field above stays bcrypt-hashed and is what login actually checks.
  plainPassword: {
    type: String,
    default: ''
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  phoneNo: {
    type: String,
    required: true,
    trim: true
  },
  photo: {
    type: String,
    default: ''
  },
  teacherNo: {
    type: String,
    default: ''
  },
  timetableImage: {
    type: String,
    default: ''
  },
  timetable: {
    type: mongoose.Schema.Types.Mixed,
    default: { schedule: [] }
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

// ✅ FIXED: async/await pre-save hook (Mongoose 7+ removed callback-style `next`)
facultySchema.pre('save', async function() {
  const faculty = this;

  // Only hash if password is modified
  if (!faculty.isModified('password')) {
    return;
  }

  // If already hashed, skip
  if (faculty.password && faculty.password.startsWith('$2b$')) {
    return;
  }

  // Keep a plain-text copy for the admin panel BEFORE hashing overwrites it
  faculty.plainPassword = faculty.password;

  // Generate salt and hash (bcryptjs promise API — no callback needed)
  const salt = await bcrypt.genSalt(10);
  faculty.password = await bcrypt.hash(faculty.password, salt);
});

// Compare password method
facultySchema.methods.comparePassword = function(candidatePassword) {
  const faculty = this;
  
  return new Promise(function(resolve, reject) {
    if (!faculty.password) {
      return resolve(false);
    }
    
    if (faculty.password.startsWith('$2b$')) {
      bcrypt.compare(candidatePassword, faculty.password, function(err, isMatch) {
        if (err) {
          return reject(err);
        }
        resolve(isMatch);
      });
    } else {
      resolve(candidatePassword === faculty.password);
    }
  });
};

// Indexes
facultySchema.index({ email: 1 });
facultySchema.index({ name: 1 });
facultySchema.index({ department: 1 });
facultySchema.index({ teacherNo: 1 });

module.exports = mongoose.model('Faculty', facultySchema);