const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  batchCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  fruitName: {
    type: String,
    default: '',
    trim: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  thumbnailUrl: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Batch', batchSchema);