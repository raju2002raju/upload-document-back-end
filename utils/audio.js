const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

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

const getPromptUpdate = () => {
    const keyFilePath = path.resolve(__dirname, '../Routes/updateprompt.json');
    if (fs.existsSync(keyFilePath)) {
        const data = JSON.parse(fs.readFileSync(keyFilePath, 'utf-8'));
        if (data.prompt) {
            return data.prompt;
        }
        throw new Error('Prompt is missing in the file.');
    }
    throw new Error(`Prompt file "${keyFilePath}" is missing or invalid.`);
};


async function transcribeAudio(filePath) {
    // First, verify the file exists and is readable
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    // Verify file size
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    if (fileSizeInMB > 25) { // Whisper API limit
        throw new Error('File size exceeds 25MB limit');
    }

    const formData = new FormData();
    
    // Add file to form data with proper content type
    const fileStream = fs.createReadStream(filePath);
    formData.append('file', fileStream, {
        filename: path.basename(filePath),
        contentType: 'audio/wav' // Ensure proper content type
    });
    
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    try {
        console.log('Sending request to OpenAI Whisper API...');
        const apiKey = getApiKey(); // Fetch API key dynamically
        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    ...formData.getHeaders()
                },
                maxBodyLength: Infinity,
                timeout: 30000 
            }
        );

        console.log('Transcription response:', response.data);
        return response.data.text;
    } catch (error) {
        console.error('Transcription error details:', error.response?.data || error.message);
        if (error.response?.status === 400) {
            throw new Error('Invalid audio file format. Please ensure the file is WAV format with proper encoding.');
        }
        throw new Error(`Transcription failed: ${error.message}`);
    } finally {
        // Clean up file stream
        fileStream.destroy();
    }
}

async function getChatCompletion(transcript, templateText = '') {
    try {
        const promptTemplate = getPromptUpdate();
        console.log('Received:', transcript);
        console.log('Template Text:', templateText);
        const apiKey = getApiKey(); 
        const messages = [
            {
              role: 'system',
              content: `You are a legal case text transformer that updates templates using user-provided instructions. Your task is to:
          1. Identify the relevant part of the user input that modifies the template.
          2. Ignore any non-essential instructions such as "Change the name of..." or "Update this...".
          3. Apply only the required change to the template, wrapping the updated text inside a <span style="background-color: #ffff00;">...</span>.
          4. Return ONLY the updated template without any quotes or additional text. 
          5. Replace "oblique" with "/". 
          6. Replace "honorable" (case-insensitive) with "Hon'ble". 
          7. Replace "under section" (case-insensitive) with "U/s".
          8. Replace "Breaket open"  with "(".
          9. Replace "Breaket close" with ")".`,
            },
            {
              role: 'user',
              content: `Update this template: "${templateText}" using this text: "${transcript}". Return ONLY the updated template value without any quotes.`
            }
          ];
          
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o',
                messages: messages,
                temperature: 0.1,
                max_tokens: 4000
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 seconds timeout
            }
        );
        
        console.log('OpenAI Response:', response.data);
        let correctedText = response.data.choices[0].message.content.trim();
        // Remove quotes if present
        correctedText = correctedText.replace(/^"|"$/g, '');
        if (!correctedText) {
            throw new Error('Empty response from API');
        }
        return {
            success: true,
            originalTemplate: templateText,
            spokenText: transcript,
            mergedText: correctedText
        };
    } catch (error) {
        console.error('Error in getChatCompletion:', error);
        
        // More detailed error handling
        if (error.code === 'ECONNABORTED') {
            console.error('Request timed out');
        }
        
        return {
            success: false,
            error: error.message || 'Unknown error occurred',
            originalTemplate: templateText || 'No template provided',
            spokenText: transcript || 'No transcript provided'
        };
    }
}

module.exports = {
    transcribeAudio,
    getChatCompletion
};
