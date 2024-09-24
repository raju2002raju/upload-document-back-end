const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const session = require('express-session'); 
const { getUsersCollection } = require('../utlis/database');
const cloudinary = require('../Routes/cloudinaryConfig');
const User = require('../models/user');
const router = express.Router();

// Set up express-session middleware
router.use(
    session({
        secret: 'your_secret_key', 
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false } 
    })
);

// Configure multer for file upload
const upload = multer({ storage: multer.memoryStorage() });

// Signup Route
// Signup Route
router.post('/signup', upload.single('profileImage'), async (req, res) => {
    const { name, email, password } = req.body;
  
    try {
      // Check if user with the provided email already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(200).json({ status: 'exist' });
      }
  
      // Proceed with image upload if a profile image is provided
      let uploadedImageUrl = null;
      if (req.file) {
        // Upload the image to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream({ folder: 'user_profiles' }, (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          });
          stream.end(req.file.buffer); // Upload file buffer to Cloudinary
        });
  
        uploadedImageUrl = uploadResult.secure_url;
      }
  
      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Create a new user with the uploaded image URL and hashed password
      const newUser = new User({
        name,
        email,
        password: hashedPassword,
        profileImage: uploadedImageUrl,
      });
  
      // Save the new user to the database
      await newUser.save();
  
      // Remove password field from the returned user object
      const { password: _, ...userWithoutPassword } = newUser.toObject();
  
      // Optionally, set the session (if you are using session handling)
      req.session.userEmail = email;
      console.log('Signup userEmail:', req.session.userEmail);
  
      // Respond with success and user data (excluding the password)
      return res.status(200).json({ status: 'success', data: userWithoutPassword });
  
    } catch (error) {
      console.error('Error during signup:', error);
      return res.status(500).json({ status: 'error', message: 'An error occurred during signup' });
    }
  });




router.post('/signup-with-google', async (req, res) => {
    const { name, email, profileImage } = req.body;
  
    try {
      const usersCollection = getUsersCollection();
      const existingUser = await usersCollection.findOne({ email });
  
      if (existingUser) {
        // User exists, log them in
        req.session.userEmail = email; 
        return res.status(200).json({ success: true, message: 'User logged in successfully', data: existingUser });
      }
  
      // User does not exist, create a new user
      const newUser = {
        name,
        email,
        profileImage,
      };
  
      const result = await usersCollection.insertOne(newUser);
      const insertedUser = await usersCollection.findOne({ _id: result.insertedId });
  
      const { password: _, ...userWithoutPassword } = insertedUser;
      req.session.userEmail = email; 
      console.log('Signup userEmail', req.session.userEmail);
      return res.status(200).json({ success: true, message: 'User signed up successfully', data: userWithoutPassword });
  
    } catch (error) {
      console.error('Error during signup with Google:', error);
      res.status(500).json({ success: false, message: 'An error occurred during signup' });
    }
  });
  
  
// Login Route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        // Find the user by email
        const user = await User.findOne({ email });
        
        // Check if user exists
        if (!user) {
            return res.status(404).json({ status: 'notexist' });
        }

        // Compare the password
        const passwordMatch = await bcrypt.compare(password, user.password);

        // If password doesn't match, send error
        if (!passwordMatch) {
            return res.status(401).json({ status: 'Password incorrect' });
        }

        // Set session email (if using sessions)
        req.session.userEmail = email;
        console.log('Login userEmail:', req.session.userEmail);

        // Respond with user data (excluding the password)
        const { password: _, ...userWithoutPassword } = user.toObject();
        res.status(200).json({ status: 'exist', user: userWithoutPassword });

    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ status: 'error', message: 'Error during login', error: error.message });
    }
});

// Get User Route
router.get('/user', async (req, res) => {
    try {
        const email = req.query.email || req.headers['user-email']; // Get email from query or header

        if (!email) {
            return res.status(400).json({ error: 'Email parameter is required' });
        }

        // Use Mongoose model to find the user by email
        const clientData = await User.find({ email });

        if (clientData.length === 0) {
            return res.status(404).json({ message: 'No data found for this email' });
        }

        res.json(clientData);
    } catch (error) {
        console.error('Error fetching client data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/logout', (req, res) => {
    try {
        // Destroy the session
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ status: 'error', message: 'Failed to log out' });
            }
            res.status(200).json({ status: 'success', message: 'Logged out successfully' });
        });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
});



module.exports = router;
