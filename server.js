const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const routes = require('./Routes/routes');
const auth = require('./Routes/auth');
const ForgotPassword = require('./Routes/forgotpassword')
const profile = require('./Routes/profileUpdate')

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// MongoDB connection from environment variables
mongoose.connect('mongodb+srv://royr55601:royr55601@cluster0.xra8inl.mongodb.net/upload-document', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Use routes
app.use('/', routes);
app.use('/auth', auth);
app.use('/api', ForgotPassword)
app.use('/profile', profile)

app.get('/', (req, res) => {
  res.send('File Processing Server is running');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
