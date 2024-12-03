// Models/section.js
const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt fields
});

const DynamicModel = mongoose.model('StoreDocument', sectionSchema);

module.exports = DynamicModel;