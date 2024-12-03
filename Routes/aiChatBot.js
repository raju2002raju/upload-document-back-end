const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
const router = express.Router(); // Create a router instance

// Middleware
app.use(bodyParser.json()); // Parse incoming requests with JSON payloads

// Example OpenAI API Key (ensure this is set in your environment variables)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key';

// Define your route using router
router.post('/ai-update', async (req, res) => {
    try {
        const { transcript, templateText } = req.body;

        // Ensure required data is provided
        if (!transcript || !templateText) {
            return res.status(400).json({ success: false, message: 'Missing required fields: transcript and/or templateText' });
        }

        console.log('Received transcript:', transcript);
        console.log('Received templateText:', templateText);

        // Chat Completion request to OpenAI
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `You are a specialized template editor. Your task is to update the template only with the information provided in the user's input text. Do not add any extra information or make assumptions; update only where necessary.`
                    },
                    {
                        role: 'user',
                        content: `Please update this template: "${templateText}" using this text: "${transcript}".`
                    }
                ],
                temperature: 0.7,
                max_tokens: 150
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        

        // Extract and return the chatbot response
        const correctedText = response.data.choices[0].message.content.trim();
        res.json({ success: true, correctedText });

    } catch (error) {
        console.error('Error in /api/ai-update:', error.message);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

module.exports=router;