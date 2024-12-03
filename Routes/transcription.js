// routes/asrRoute.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { transcribeAudio, getChatCompletion } = require('../utils/audio');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
        cb(null, `audio-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Check MIME type and file extension
    const allowedMimes = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm'];
    const allowedExts = ['.wav', '.webm'];
    
    if (allowedMimes.includes(file.mimetype) &&
        allowedExts.includes(path.extname(file.originalname).toLowerCase())) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only WAV and WebM files are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB limit (Whisper API limit)
    }
});

router.post('/asr', upload.single('audio'), async (req, res) => {
    console.log('Received ASR request');
    const file = req.file;
    
    try {
        if (!file) {
            throw new Error('No audio file received');
        }

        console.log('Processing file:', file.path);
        console.log('File details:', {
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size
        });

        // Handle template text if provided
        const selectedText = req.body.selectedText || '';
        console.log('Template text:', selectedText);

        // Transcribe audio
        const transcript = await transcribeAudio(file.path);
        console.log('Transcription result:', transcript);

        // Get chat completion
        const chatResponse = await getChatCompletion(transcript, selectedText);
        console.log(selectedText)
        console.log('Chat completion result:', chatResponse);

        // Generate recording URL
        const recordingUrl = `http://localhost:8080/uploads/${file.filename}`;

        // Clean up the uploaded file
        fs.unlink(file.path, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        res.status(200).json({
            success: true,
            message: 'Audio processed successfully',
            transcript,
            chatResponse,
            recordingUrl
        });

    } catch (error) {
        console.error('Error processing audio:', error);
        
        // Clean up file if it exists
        if (file && file.path) {
            fs.unlink(file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        res.status(500).json({
            success: false,
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

module.exports = router;