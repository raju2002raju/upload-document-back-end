const mongoose = require('mongoose');

// File Schema (Embedded in User)
const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  extractedText: { type: [String] }, 
  uploadTime: { type: Date, default: Date.now },
  chatHistory: [
    {
      question: String,
      answer: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
  userEmail: { type: String, required: true } 
});

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  files: [fileSchema] 
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = { User };
