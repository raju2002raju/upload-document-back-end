const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  extractedText: { type: [String] }, // Allow array of strings
  uploadTime: { type: Date, default: Date.now },
  chatHistory: [
    {
      question: String,
      answer: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
});


module.exports = mongoose.model('Chat-History', fileSchema);