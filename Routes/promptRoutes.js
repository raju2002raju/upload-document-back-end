const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const router = express.Router();

// Define the file where the OpenAI key will be stored
const keyFilePath = path.join(__dirname, 'updateprompt.json');

// Helper function to read the key file
const readKeyFile = () => {
  if (fs.existsSync(keyFilePath)) {
    const data = fs.readFileSync(keyFilePath, 'utf-8');
    return JSON.parse(data).prompt || null;
  }
  return null;
};

// Helper function to write the key file
const writeKeyFile = (prompt) => {
  const data = JSON.stringify({ prompt }, null, 2);
  fs.writeFileSync(keyFilePath, data, 'utf-8');
};

// Save OpenAI Key
router.post('/update-prompts', (req, res) => {
  const { prompts } = req.body;

  if (!prompts || typeof prompts !== 'string') {
    return res.status(400).json({ error: 'Invalid OpenAI key.' });
  }

  try {
    writeKeyFile(prompts);
    return res.status(200).json({ message: 'OpenAI key saved successfully.' });
  } catch (error) {
    console.error('Error saving OpenAI key:', error);
    return res.status(500).json({ error: 'Failed to save OpenAI key.' });
  }
});

// Remove OpenAI Key
router.delete('/update-prompts', (req, res) => {
  try {
    if (fs.existsSync(keyFilePath)) {
      fs.unlinkSync(keyFilePath);
      return res.status(200).json({ message: 'OpenAI key removed successfully.' });
    }
    return res.status(404).json({ error: 'No OpenAI key found to delete.' });
  } catch (error) {
    console.error('Error removing OpenAI key:', error);
    return res.status(500).json({ error: 'Failed to remove OpenAI key.' });
  }
});

// Fetch OpenAI Key (optional for debugging)
router.get('/update-prompts', (req, res) => {
  try {
    const prompt = readKeyFile();
    if (prompt) {
      return res.status(200).json({ prompt });
    }
    return res.status(404).json({ error: 'No OpenAI key found.' });
  } catch (error) {
    console.error('Error reading OpenAI key:', error);
    return res.status(500).json({ error: 'Failed to read OpenAI key.' });
  }
});

module.exports = router;
