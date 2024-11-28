const mongoose = require('mongoose');

// File Schema
const fileSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false  // Make userId optional
  },
  name: { 
    type: String, 
    required: true,
    unique: true  // Ensure unique file names
  },
  extractedText: { type: [String] },
  uploadTime: { type: Date, default: Date.now },
  chatHistory: [
    {
      question: String,
      answer: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

// Create or retrieve the existing model
const modelName = 'File';
module.exports = mongoose.models[modelName] || mongoose.model(modelName, fileSchema);