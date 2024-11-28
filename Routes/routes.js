const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
const { encode } = require('gpt-3-encoder');
const {connectToDatabase} = require('../utlis/database')
const File = require('../models/File');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../uploads/') }).single('file');
const pdfExtract = new PDFExtract();

let storedParagraphs = [];
const getApiKey = () => {
  // Resolve the path relative to the current file
  const keyFilePath = path.resolve(__dirname, '../Routes/updatekey.json');
  if (fs.existsSync(keyFilePath)) {
      const data = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
      if (data.key) {
          return data.key;
      }
      throw new Error('API key is missing .');
  }
  throw new Error(`API key file "${keyFilePath}" is missing or invalid.`);
};

const extractTextFromPdf = async (pdfPath) => {
  try {
    const data = await pdfExtract.extract(pdfPath, {});
    return data.pages.map(page =>
      page.content.map(item => item.str).join(' ')
    ).join('\n\n');
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    throw error;
  }
};

const extractTextFromDocx = async (docxPath) => {
  try {
    const result = await mammoth.extractRawText({ path: docxPath });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error.message);
    throw error;
  }
};

const extractTextFromImage = async (imagePath) => {
  try {
    const result = await Tesseract.recognize(imagePath, 'eng');
    return result.data.text;
  } catch (error) {
    console.error('Error extracting text from Image:', error.message);
    throw error;
  }
};

const splitTextIntoParagraphs = (text) => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
  const paragraphs = [];
  let currentParagraph = '';

  for (const line of lines) {
    if (line.length < 50 || /^\d+\.|\w\./.test(line) || line === line.toUpperCase()) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
      }
      paragraphs.push(line);
      currentParagraph = '';
    } else {
      currentParagraph += (currentParagraph ? '\n' : '') + line;
    }
  }

  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }

  return paragraphs;
};

async function getChatCompletion(query, paragraphs) {
  const MAX_TOKENS = 8000;  
  const CHUNK_OVERLAP = 100;  
  
  let allChunks = [];
  let currentChunk = "";
  let tokenCount = 0;

  for (let paragraph of paragraphs) {
    const paragraphTokens = encode(paragraph).length;
    if (tokenCount + paragraphTokens > MAX_TOKENS) {
      allChunks.push(currentChunk);
      currentChunk = "";
      tokenCount = 0;
    }
    currentChunk += paragraph + "\n\n";
    tokenCount += paragraphTokens;
  }
  if (currentChunk) allChunks.push(currentChunk);

  let responses = [];
  for (let chunk of allChunks) {
    const prompt = `Given the following text:\n\n${chunk}\n\nPlease answer the following question: ${query}`;
    const apiKey = getApiKey(); // Fetch API key dynamically
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
      responses.push(response.data.choices[0].message.content);
    } catch (error) {
      console.error('Error processing chunk:', error.message);
    }
  }

  return responses.join("\n\n");
}


router.post('/upload', async (req, res) => {
  try {
    await connectToDatabase();

    upload(req, res, async function (err) {
      if (err) {
        return res.status(500).json({ error: 'An error occurred while uploading.' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const filePath = req.file.path;
      let extractedText = '';

      try {
        if (path.extname(req.file.originalname).toLowerCase() === '.pdf') {
          extractedText = await extractTextFromPdf(filePath);
        } else if (path.extname(req.file.originalname).toLowerCase() === '.docx') {
          extractedText = await extractTextFromDocx(filePath);
        } else if (['.png', '.jpg', '.jpeg', '.bmp'].includes(path.extname(req.file.originalname).toLowerCase())) {
          extractedText = await extractTextFromImage(filePath);
        } else {
          return res.status(400).json({ error: 'Unsupported file format.' });
        }

        const paragraphs = splitTextIntoParagraphs(extractedText);

        // Optional: If you want to associate with a user, you can pass userId in the request
        const userId = req.body.userId;

        // Check if a file with the same name already exists
        let file = await File.findOne({ name: req.file.originalname });

        if (file) {
          // Update existing file
          file.extractedText = paragraphs;
          file.uploadTime = new Date();
          if (userId) file.userId = userId;
        } else {
          // Create new file
          file = new File({
            name: req.file.originalname,
            extractedText: paragraphs,
            uploadTime: new Date(),
            ...(userId && { userId }),  // Conditionally add userId if provided
            chatHistory: []
          });
        }

        await file.save();

        res.json({
          success: true,
          message: file.isNew ? 'File uploaded and processed successfully.' : 'File updated successfully.',
          file: file,
          paragraphs: paragraphs
        });

      } catch (processError) {
        console.error('Error processing file:', processError);
        res.status(500).json({ error: `Failed to process file: ${processError.message}` });
      } finally {
        fs.unlink(filePath, (unlinkErr) => {
          if (unlinkErr) console.error('Error deleting file:', unlinkErr);
        });
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Server error occurred' });
  }
});
router.post('/api', (req, res) => {
  console.log('Received upload request:', req.body);

  let { extractedText } = req.body;
  
  if (!extractedText) {
    console.error('Missing extractedText');
    return res.status(400).json({ error: 'Missing extractedText' });
  }

  try {
    if (Array.isArray(extractedText)) {
      extractedText = extractedText.join('\n\n');
    } else if (typeof extractedText !== 'string') {
      throw new Error('extractedText is neither a string nor an array');
    }

    storedParagraphs = extractedText.split('\n\n').filter(para => para.trim() !== '');
    
    console.log('Stored paragraphs:', storedParagraphs);

    res.json({ 
      message: 'Extracted text received and stored successfully', 
      paragraphCount: storedParagraphs.length,
      paragraphs: storedParagraphs
    });
  } catch (error) {
    console.error('Error processing extractedText:', error);
    res.status(500).json({ error: 'Error processing extracted text' });
  }
});

router.post('/save-chat', async (req, res) => {
  const { fileName, question, answer } = req.body;
  if (!fileName || !question || !answer) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    await connectToDatabase(); 
    const file = await File.findOne({ name: fileName });

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    file.chatHistory.push({
      question,
      answer,
      timestamp: new Date()
    });

    await file.save();

    res.json({ message: 'Chat history saved successfully.' });

  } catch (error) {
    console.error('Error saving chat history:', error.message);
    res.status(500).json({ error: 'Error saving chat history.' });
  }
});


router.post('/search', async (req, res) => {
  try {
    const { query, paragraphs } = req.body;
    console.log('Received search request:', { query, paragraphCount: paragraphs.length });
    const answer = await getChatCompletion(query, paragraphs);
    res.json({ success: true, question: query, answer });
  } catch (error) {
    console.error('Error processing search:', error);
    res.status(500).json({
      error: 'Failed to process search',
      details: error.message,
      stack: error.stack
    });
  }
});

router.post('/process-file', (req, res) => {
  const { fileName, extractedText } = req.body;

  if (!fileName || !extractedText) {
    return res.status(400).send('Invalid request data.');
  }

  console.log(`Processing file: ${fileName}`);
  console.log('Extracted text:', extractedText);

  res.send('File processed successfully.');
});


router.get('/get-chat-history/:fileName', async (req, res) => {
  const { fileName } = req.params;

  try {
    const file = await File.findOne({ name: fileName });

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    res.json({ chatHistory: file.chatHistory });
  } catch (error) {
    console.error('Error fetching chat history:', error.message);
    res.status(500).json({ error: 'Error fetching chat history.' });
  }
});

router.get('/get-filename-history', async (req, res) => {
  try {
    const files = await File.find({})
      .select('name extractedText createdAt')
      .sort({ createdAt: 1 });

    res.status(200).json(files);
  } catch (error) {
    console.error('Error fetching file history:', error);
    res.status(500).json({ error: 'Server error occurred.' });
  }
});


module.exports = router;