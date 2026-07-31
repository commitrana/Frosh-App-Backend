const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
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
    default: '' 
  },
  // branch is no longer supplied by the current sheet (NAME/FNAME/APPNO/
  // EMAIL/MOBILE). No longer required — stays '' if not provided, never
  // throws a validation error.
  branch: { 
    type: String, 
    default: '',
    trim: true 
  },
  phoneNo: { 
    type: String, 
    required: true,
    trim: true 
  },
  // dob is no longer supplied either. No longer required. default: null
  // means "unknown", not "invalid" — reads back as null/blank everywhere.
  dob: { 
    type: Date, 
    default: null 
  },
  fatherName: { 
    type: String, 
    required: true,
    trim: true 
  },
  // motherName no longer supplied. No longer required — blank is fine.
  motherName: { 
    type: String, 
    default: '',
    trim: true 
  },
  rollNo: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  // slotNumber no longer supplied. No longer required. Also removed the
  // enum: [1, 2] restriction, since a missing value (undefined/null) would
  // otherwise fail that enum check.
  slotNumber: { 
    type: Number, 
    default: null 
  },
  // Bootcamp batch assignment, e.g. "RedA", "BlueB". null = not yet assigned.
  batch: {
    type: String,
    default: null,
    trim: true
  },
  // Public Supabase Storage URL for the student's profile photo, set via
  // POST /admin/students/me/photo. null = student hasn't uploaded one yet.
  profileImage: {
    type: String,
    default: null
  },
  // Storage path (not the URL) — kept so we can delete the old file from
  // the Supabase bucket whenever the student replaces their photo, same
  // pattern as TeamMember.imagePath in models/TeamMember.js.
  profileImagePath: {
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

// Indexes
studentSchema.index({ name: 1 });
studentSchema.index({ email: 1 });
studentSchema.index({ rollNo: 1 });
studentSchema.index({ branch: 1 });
studentSchema.index({ batch: 1 });

// Method to generate random password
studentSchema.methods.generatePassword = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.password = password;
  return password;
};

// Password is stored and compared as plain text — simple by design for
// this project. NOTE: a small number of existing accounts were hashed by
// an earlier version of this backend (bcrypt strings start with "$2b$").
// Those can't be un-hashed, so this falls back to bcrypt-compare only for
// that legacy shape; every password set going forward is stored as plain
// text and compared directly, no hashing involved.
const bcrypt = require('bcryptjs');
studentSchema.methods.comparePassword = async function (candidatePassword) {
  if (this.password && this.password.startsWith('$2b$')) {
    return bcrypt.compare(candidatePassword, this.password);
  }
  return candidatePassword === this.password;
};

// ✅ IMPORTANT: Yeh line honi chahiye
module.exports = mongoose.model('Student', studentSchema);