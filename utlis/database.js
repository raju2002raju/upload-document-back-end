const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const mongoURI = "mongodb+srv://royr55601:royr55601@cluster0.xra8inl.mongodb.net/upload-document";

// Connect using Mongoose
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => console.log('Connected to MongoDB'));

// Connect using native MongoDB driver
const mongoClient = new MongoClient(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

let database, usersCollection;

const connectToDatabase = async () => {
    if (database && usersCollection) {
      return; // Prevent multiple connections
    }
  
    try {
      await mongoClient.connect();
      console.log("Connected to MongoDB (Native Client)");
  
      database = mongoClient.db("upload-document");
      usersCollection = database.collection("users");
    } catch (error) {
      console.error("MongoDB connection error (Native Client):", error);
      throw new Error('Database connection failed');
    }
  };
  

const getDatabase = () => {
  if (!database) {
    throw new Error('Database not initialized');
  }
  return database;
};

const getUsersCollection = () => {
  if (!usersCollection) {
    throw new Error('Users collection not initialized');
  }
  return usersCollection;
};

// File Schema
const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  extractedText: { type: [String] },
  uploadTime: { type: Date, default: Date.now },
  chatHistory: [
    {
      question: String,
      answer: String,
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

const File = mongoose.model('File', fileSchema);

module.exports = {
  connectToDatabase,
  getDatabase,
  getUsersCollection,
  File
};