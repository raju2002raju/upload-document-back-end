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
const { User, File } = require('../models/File');
const {PdfToImg} = require('pdf2image')

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../uploads/') }).single('file');
const pdfExtract = new PDFExtract();

let storedParagraphs = [];


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
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
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

      const userEmail = req.body.userEmail;
      if (!userEmail) {
        return res.status(400).json({ error: 'User email is required.' });
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
        let user = await User.findOne({ email: userEmail });
        if (!user) {
          user = new User({ email: userEmail, files: [] });
        }

        // Check if a file with the same name already exists
        const existingFileIndex = user.files.findIndex(file => file.name === req.file.originalname);

        if (existingFileIndex !== -1) {
          // Update existing file
          user.files[existingFileIndex].extractedText = paragraphs;
          user.files[existingFileIndex].uploadTime = new Date();
          // Preserve existing chat history
        } else {
          // Add new file
          const newFile = {
            name: req.file.originalname,
            extractedText: paragraphs,
            uploadTime: new Date(),
            userEmail: userEmail,
            chatHistory: []
          };
          user.files.push(newFile);
        }

        await user.save();

        res.json({
          success: true,
          message: existingFileIndex !== -1 ? 'File updated successfully.' : 'File uploaded and processed successfully.',
          file: user.files[existingFileIndex !== -1 ? existingFileIndex : user.files.length - 1],
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
  const { userEmail, fileName, question, answer } = req.body;
  if (!userEmail || !fileName || !question || !answer) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    await connectToDatabase(); 
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const file = user.files.find(f => f.name === fileName);

    if (!file) {
      return res.status(404).json({ error: 'File not found for this user.' });
    }

    file.chatHistory.push({
      question,
      answer,
      timestamp: new Date()
    });

    await user.save();

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
  const userEmail = req.headers['user-email']; 


  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required.' });
  }

  try {
    const user = await User.findOne({ email: userEmail });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const file = user.files.find(file => file.name === fileName);

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    res.json({ chatHistory: file.chatHistory });
  } catch (error) {
    console.error('Error fetching chat history:', error.message);
    res.status(500).json({ error: 'Error fetching chat history.' });
  }
});


// router.get('/get-filename-history', async (req, res) => {
//   const userEmail = req.query.userEmail; 


//   if (!userEmail) {
//     return res.status(400).json({ error: 'User email is required.' });
//   }

//   try {
//     const user = await User.findOne({ email: userEmail }).select('files.name files.extractedText files.createdAt -_id');

//     if (!user) {
//       return res.status(404).json({ error: 'User not found.' });
//     }

//     // Sort files by createdAt in descending order
//     const files = user.files
//       .map(file => ({
//         name: file.name,
//         extractedText: file.extractedText,
//         createdAt: file.createdAt
//       }))
//       .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Latest first

//     res.status(200).json(files);
//   } catch (error) {
//     console.error('Error fetching file history:', error);
//     res.status(500).json({ error: 'Server error occurred.' });
//   }
// });

router.get('/get-filename-history', async (req, res) => {
  const userEmail = req.query.userEmail; 

  if (!userEmail) {
    return res.status(400).json({ error: 'User email is required.' });
  }

  try {
    const user = await User.findOne({ email: userEmail }).select('files.name files.extractedText files.createdAt -_id');

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Sort files by createdAt in ascending order (oldest first)
    const files = user.files
      .map(file => ({
        name: file.name,
        extractedText: file.extractedText,
        createdAt: file.createdAt
      }))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.status(200).json(files);
  } catch (error) {
    console.error('Error fetching file history:', error);
    res.status(500).json({ error: 'Server error occurred.' });
  }
});


module.exports = router;