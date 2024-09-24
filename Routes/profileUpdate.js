const express = require('express');
const router = express.Router();
const multer = require('multer');
const User = require('../models/user');
const cloudinary = require('../Routes/cloudinaryConfig'); // Import the configured Cloudinary instance

const upload = multer({ storage: multer.memoryStorage() });


router.post('/update', upload.single('profileImage'), async (req, res) => {
  const { name, phone, email: profileEmail } = req.body; // Extract new email from the request body
  const originalEmail = req.headers['user-email']; // Extract original email from the headers

  try {
    let profileImageUrl = null;

    // Check if a new profile image is uploaded
    if (req.file) {
      const uploadToCloudinary = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: 'profile_images' },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        );

        uploadStream.end(req.file.buffer);
      });

      const result = await uploadToCloudinary;
      profileImageUrl = result.secure_url;
    }

    const user = await User.findOneAndUpdate(
      { email: originalEmail },
      { name, phone, email: profileEmail, profileImage: profileImageUrl },
      { new: true }
    );

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.status(200).send('Profile updated successfully');
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send('Server error');
  }
});


module.exports = router;
