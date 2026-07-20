const mongoose = require('mongoose');

const TeamMemberSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['faculty', 'osc', 'core', 'mentor'],
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  branch: {
    type: String,       // used by osc / core
    trim: true,
    default: '',
  },
  designation: {
    type: String,       // used by faculty
    trim: true,
    default: '',
  },
  imageUrl: {
    type: String,       // public URL returned by Supabase Storage
    required: true,
  },
  imagePath: {
    type: String,       // storage path inside the bucket — needed to delete the
                         // file from Supabase later (the public URL alone isn't
                         // enough for that). Not in the original spec, but you'll
                         // want it the moment someone deletes/replaces a photo.
  },
  order: {
    type: Number,        // optional display sequence within a category
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

TeamMemberSchema.index({ category: 1, order: 1 });

module.exports = mongoose.model('TeamMember', TeamMemberSchema);