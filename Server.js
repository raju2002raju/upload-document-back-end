require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 8080;

// CORS configuration
app.use(cors({
  origin: 'https://upload-document-front-end.vercel.app', // Removed trailing slash
  credentials: true
}));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://royr55601:royr55601@cluster0.xra8inl.mongodb.net/legaldrafting', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}).catch((error) => {
  console.error('Error connecting to MongoDB:', error);
});

// Import route files
const transcriptionRoutes = require('./Routes/transcription');
const apiRoutes = require('./Routes/sectionRoutes');
const aiBot = require('./Routes/aiChatBot');
const exportFile = require('./Routes/exportFiles');
const aiAudioChat = require('./Routes/aiAudioChat');
const sendOtp = require('./Routes/otpVerification');
const storeDocument = require('./Routes/storeDocument');
const logout = require('./Routes/logout');
const storeKey = require('./Routes/openAiKeyRoutes');
const updatePrompts = require('./Routes/promptRoutes')
// Use routes
app.use('/api', transcriptionRoutes);
app.use('/api', apiRoutes);
app.use('/api', aiBot);
app.use('/api', exportFile);
app.use('/api', aiAudioChat);
app.use('/api', sendOtp)
app.use('/api', storeDocument)
app.use('/api', logout);
app.use('/api', storeKey);
app.use('/api' , updatePrompts)
// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send({ error: 'Something broke!' });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).send({ error: 'Route not found' });
});
