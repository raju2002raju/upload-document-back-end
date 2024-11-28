const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const uploadSingle = multer({ storage: storage }).single('file');
const uploadMultiple = multer({ storage: storage }).array('images', 10);

module.exports = { uploadSingle, uploadMultiple };