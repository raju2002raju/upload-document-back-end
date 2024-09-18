const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const axios = require('axios');
const PDFExtract = require('pdf.js-extract').PDFExtract;
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');
require('dotenv').config();
const File = require('./models/File'); 
const { encode } = require('gpt-3-encoder');


const app = express();
app.use(cors());
app.use(express.json());
let storedParagraphs = [];

const upload = multer({ dest: 'uploads/' }).single('file');
const pdfExtract = new PDFExtract();

// Extract text from PDF
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

// Extract text from DOCX
const extractTextFromDocx = async (docxPath) => {
  try {
    const result = await mammoth.extractRawText({ path: docxPath });
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error.message);
    throw error;
  }
};

// Extract text from Image
const extractTextFromImage = async (imagePath) => {
  try {
    const result = await Tesseract.recognize(imagePath, 'eng');
    return result.data.text;
  } catch (error) {
    console.error('Error extracting text from Image:', error.message);
    throw error;
  }
};

// Split text into paragraphs
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

// Upload route with Multer error handling
app.post('/upload', (req, res) => {
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(500).json({ error: 'Multer error occurred while uploading.' });
    } else if (err) {
      return res.status(500).json({ error: 'An unknown error occurred while uploading.' });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = path.join(__dirname, req.file.path);

    try {
      const fileBuffer = await fs.promises.readFile(filePath);
      const fileSignature = fileBuffer.toString('utf8', 0, 4);

      let extractedText = '';

      // Check file format and extract text accordingly
      if (fileSignature === '%PDF') {
        extractedText = await extractTextFromPdf(filePath);
      } else if (path.extname(req.file.originalname).toLowerCase() === '.docx') {
        extractedText = await extractTextFromDocx(filePath);
      } else if (['.png', '.jpg', '.jpeg', '.bmp'].includes(path.extname(req.file.originalname).toLowerCase())) {
        extractedText = await extractTextFromImage(filePath);
      } else {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: 'Unsupported file format. Please upload a PDF, DOCX, or image file.' });
      }

      console.log('Raw extracted text:', extractedText);

      const paragraphs = splitTextIntoParagraphs(extractedText);
      console.log('Processed paragraphs:', JSON.stringify(paragraphs, null, 2));

      res.json({
        success: true,
        rawText: extractedText,
        paragraphs: paragraphs,
        formattedText: paragraphs.join('\n\n')
      });



    } catch (error) {
      console.error('Error processing file:', error.message);
      res.status(500).json({ error: `Failed to process file: ${error.message}` });
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});




app.post('/api', (req, res) => {
  console.log('Received upload request:', req.body);

  let { extractedText } = req.body;
  
  if (!extractedText) {
    console.error('Missing extractedText');
    return res.status(400).json({ error: 'Missing extractedText' });
  }

  try {
    // Handle both string and array inputs
    if (Array.isArray(extractedText)) {
      extractedText = extractedText.join('\n\n');
    } else if (typeof extractedText !== 'string') {
      throw new Error('extractedText is neither a string nor an array');
    }

    // Convert the extractedText string into an array of paragraphs
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

// Chat completion helper function
// async function getChatCompletion(query, paragraphs) {
//   try {
//     const prompt = `Act as a semantic search API. Given the following paragraphs:

// ${paragraphs.join('\n\n')}

// Please answer the following question based on the content above: ${query}`;

//     console.log(`Prompt: ${prompt}`);

//     const response = await axios.post(
//       'https://api.openai.com/v1/chat/completions',
//       {
//         model: 'gpt-4',
//         messages: [{ role: 'user', content: prompt }],
//         max_tokens: 150
//       },
//       {
//         headers: {
//           'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
//         }
//       }
//     );

//     if (response.data && response.data.choices && response.data.choices[0]) {
//       return response.data.choices[0].message.content;
//     } else {
//       console.error('Unexpected API response structure:', response.data);
//       throw new Error('Unexpected response structure from OpenAI API');
//     }
//   } catch (error) {
//     console.error('Error during chat completion:', error.message);
//     if (error.response) {
//       console.error('OpenAI API response status:', error.response.status);
//       console.error('OpenAI API response data:', error.response.data);
//     }
//     throw error;
//   }
// }

const mongoose = require('mongoose');

mongoose.connect('mongodb+srv://royr55601:royr55601@cluster0.xra8inl.mongodb.net/upload-document', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});




app.post('/save-chat', async (req, res) => {
  const { fileName, question, answer, extractedText } = req.body;
  

  if (!fileName || !question || !answer || !extractedText) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const result = await File.updateOne(
      { name: fileName },
      { 
        $push: { chatHistory: { question, answer } },
        $set: { extractedText: extractedText } 
      },
      { upsert: true },
    );
    if (result.nModified === 0 && result.upsertedCount === 0) {
      return res.status(404).json({ error: 'File not found and failed to create new record.' });
    }

    res.json({ message: 'Chat history saved successfully.' });
  } catch (error) {
    console.error('Error saving chat history:', error.message);
    res.status(500).json({ error: 'Error saving chat history.' });
  }
});

// Search route
app.post('/search', async (req, res) => {
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

app.post('/process-file', (req, res) => {
  const { fileName, extractedText } = req.body;

  if (!fileName || !extractedText) {
    return res.status(400).send('Invalid request data.');
  }

  // Your processing logic here
  console.log(`Processing file: ${fileName}`);
  console.log('Extracted text:', extractedText);

  res.send('File processed successfully.');
});

app.get('/get-chat-history/:fileName', async (req, res) => {
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

app.get('/get-filename-history', async (req, res) => {
  try {
    const files = await File.find().select('name extractedText -_id');
    res.status(200).json(files);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Server error occurred' });
  }
});


app.get('/', (req, res) => {
  res.send('File Processing Server is running');
});


const PORT = 8080;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
