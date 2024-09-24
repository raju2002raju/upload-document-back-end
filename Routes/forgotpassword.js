const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/user');

let otpStorage = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'royr55601@gmail.com',
    pass: 'iseq vxvn ydog agna',
  },
  tls: {
    rejectUnauthorized: false, 
  },
});


router.use((req, res, next) => {
  console.log('--------------------');
  console.log('New request received:');
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('--------------------');
  next();
});

router.post('/forgot-password', async (req, res) => {
  console.log('Forgot password route hit');
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStorage[email] = {
    otp,
    expiry: Date.now() + 10 * 60 * 1000, // OTP expires in 10 minutes
  };

  console.log(`Generated OTP for ${email}: ${otp}`);
  console.log(`OTP Storage after generation:`, otpStorage);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP',
    text: `Your OTP for password reset is: ${otp}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
});

router.post('/verify-otp', (req, res) => {
  console.log('Verify OTP route hit');
  const { email, otp } = req.body;

  console.log(`Verifying OTP for ${email}: ${otp}`);
  console.log('Current OTP Storage:', otpStorage);

  if (!otpStorage[email]) {
    return res.status(400).json({ success: false, message: 'No OTP found for this email' });
  }

  const storedOTP = otpStorage[email].otp;
  const expiryTime = otpStorage[email].expiry;

  console.log(`Stored OTP: ${storedOTP}, Expiry: ${new Date(expiryTime)}, Current time: ${new Date()}`);

  if (storedOTP === otp && expiryTime > Date.now()) {
    res.json({ success: true, message: 'OTP verified successfully' });
  } else if (storedOTP !== otp) {
    res.status(400).json({ success: false, message: 'Invalid OTP' });
  } else {
    res.status(400).json({ success: false, message: 'OTP has expired' });
  }
});

router.post('/reset-password', async (req, res) => {
  console.log('Reset password route hit');
  console.log('Request body:', req.body);

  let { email, otp, newPassword } = req.body; // Destructure email, otp, and newPassword

  // Remove commas from OTP
  otp = otp.replace(/,/g, ''); // Remove all commas from OTP

  console.log('Parsed data:', { 
    email: email || 'undefined', 
    otp: otp || 'undefined', 
    newPassword: newPassword ? '***' : 'undefined'
  });
  console.log('Current OTP Storage:', otpStorage);

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email, OTP, and new password are required',
      receivedEmail: !!email,
      receivedOTP: !!otp,
      receivedPassword: !!newPassword
    });
  }

  if (!otpStorage[email]) {
    return res.status(400).json({ success: false, message: 'No OTP found for this email' });
  }

  if (otpStorage[email].otp === otp && otpStorage[email].expiry > Date.now()) {
    try {
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const result = await User.updateOne(
        { email },
        { $set: { password: hashedPassword } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      delete otpStorage[email];
      console.log('Password reset successful. Updated OTP Storage:', otpStorage);

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
      console.error('Error resetting password:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  } else {
    console.log('OTP verification failed for password reset');
    res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
  }
});




router.post('/reset-password-setting', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const email = req.headers['user-email']; 
    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Email, old password, and new password are required.' });
    }

    console.log('Request body:', req.body);
    console.log('Email from header:', email);

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log('User found:', user);

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Old password is incorrect.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Error in reset-password-setting:', error.message);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
});




router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  // Generate a new OTP
  const newOtp = crypto.randomInt(100000, 999999).toString();
  otpStorage[email] = {
    otp: newOtp,
    expiry: Date.now() + 10 * 60 * 1000, 
  };

  console.log(`New OTP generated for ${email}: ${newOtp}`);
  console.log('Updated OTP Storage:', otpStorage);

  // Send the new OTP via email
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset OTP - Resent',
    text: `Your new OTP for password reset is: ${newOtp}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'New OTP sent to your email' });
  } catch (error) {
    console.error('Error resending OTP:', error);
    res.status(500).json({ success: false, message: 'Error resending OTP' });
  }
});



module.exports = router;