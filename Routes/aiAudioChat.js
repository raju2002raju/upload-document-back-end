const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');
const { exec } = require('child_process');

const router = express.Router();

const upload = multer({ 
    dest: 'uploads/',
    limits: { 
        fileSize: 10 * 1024 * 1024 // 10MB file size limit
    }
});

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Promisified exec for file conversion
const execPromise = (cmd) => {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
};

// Convert audio to WAV using ffmpeg
const convertToWav = async (inputPath) => {
    const outputPath = `${inputPath}.wav`;
    const cmd = `ffmpeg -i "${inputPath}" -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`;
    
    try {
        await execPromise(cmd);
        return outputPath;
    } catch (error) {
        console.error('Conversion error:', error);
        throw new Error('Failed to convert audio file');
    }
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

router.post('/ai-audio-update', upload.single('audio'), asyncHandler(async (req, res) => {
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ 
            success: false, 
            message: 'OpenAI API Key is not configured' 
        });
    }

    if (!req.file) {
        return res.status(400).json({ 
            success: false, 
            message: 'No audio file provided' 
        });
    }

    const { path: tempPath } = req.file;
    const { templateText } = req.body;

    try {
        // Transcribe audio directly
        const transcript = await transcribeAudio(tempPath);

        // Generate improved text
        const correctedText = await generateImprovedText(templateText, transcript);

        // Clean up file
        fs.unlinkSync(tempPath);

        res.json({ 
            success: true, 
            correctedText 
        });

    } catch (error) {
        // Cleanup in case of error
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

        console.error('Error processing audio:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Internal server error' 
        });
    }
}));
// In transcribeAudio function
async function transcribeAudio(filePath) {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    try {
        console.log('Transcription Request Payload:', {
            filePath,
            fileSize: fs.statSync(filePath).size
        });

        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    ...formData.getHeaders()
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity
            }
        );
        
        console.log('Transcription Response:', response.data);
        return response.data.text || '';
    } catch (error) {
        console.error('Detailed Transcription Error:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });
        throw error;
    }
}

async function generateImprovedText(templateText, transcript) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a text formatting assistant that intelligently combines template text with transcribed speech.'
                    },
                    {
                        role: 'user',
                        content: `Template Text: "${templateText}"
Transcribed Speech: "${transcript}"

Please merge these, preserving the structure of the template while incorporating relevant details from the speech.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 250
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data.choices[0].message.content.trim() || templateText;
    } catch (error) {
        console.error('Text generation error:', error.response?.data || error.message);
        throw new Error('Failed to generate improved text');
    }
}

module.exports = router;