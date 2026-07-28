const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  branch: { 
    type: String, 
    required: true,
    trim: true 
  },
  phoneNo: { 
    type: String, 
    required: true,
    trim: true 
  },
  dob: { 
    type: Date, 
    required: true 
  },
  fatherName: { 
    type: String, 
    required: true,
    trim: true 
  },
  motherName: { 
    type: String, 
    required: true,
    trim: true 
  },
  rollNo: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true 
  },
  slotNumber: { 
    type: Number, 
    required: true, 
    enum: [1, 2] 
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

// Hash the password before saving — same backward-compatible pattern used by
// Member/Society: if it's already a bcrypt hash (starts with "$2b$"), leave
// it alone so we never double-hash.
studentSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  if (!this.password) return next(); // empty password, nothing to hash yet
  if (this.password.startsWith('$2b$')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// findByIdAndUpdate / updateOne / updateMany do NOT run the pre('save')
// hook above, so any route that updates a student via those (e.g. the
// admin PUT /students/:id and PUT /students/bulk routes) would otherwise
// be able to write a plain-text password straight into the DB. Catch that
// here too, for both single-doc and bulk update paths.
async function hashPasswordInUpdate(next) {
  const update = this.getUpdate();
  if (!update) return next();

  const pwd = update.password ?? update.$set?.password;
  if (!pwd || pwd.startsWith('$2b$')) return next();

  const hashed = await bcrypt.hash(pwd, await bcrypt.genSalt(10));
  if (update.password !== undefined) update.password = hashed;
  if (update.$set?.password !== undefined) update.$set.password = hashed;
  next();
}
studentSchema.pre('findOneAndUpdate', hashPasswordInUpdate);
studentSchema.pre('updateOne', hashPasswordInUpdate);
studentSchema.pre('updateMany', hashPasswordInUpdate);

// Compare a candidate password against the stored one. Supports legacy
// plain-text rows so existing accounts keep working until they save again
// (at which point the pre-save hook above hashes them).
studentSchema.methods.comparePassword = async function(candidatePassword) {
  if (this.password && this.password.startsWith('$2b$')) {
    return bcrypt.compare(candidatePassword, this.password);
  }
  return candidatePassword === this.password;
};

// ✅ IMPORTANT: Yeh line honi chahiye
module.exports = mongoose.model('Student', studentSchema);