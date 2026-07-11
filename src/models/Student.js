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

// ✅ IMPORTANT: Yeh line honi chahiye
module.exports = mongoose.model('Student', studentSchema);