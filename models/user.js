const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  password: String,
  profileImage: String, 
  

});

module.exports = mongoose.model('users', userSchema);
