const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Local disk storage for event cover photos — no Cloudinary.
// server.js serves this same folder statically via:
//   app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// server.js lives in src/, so that resolves to src/uploads — this file
// (src/middleware/upload.js) points at the SAME folder via '../uploads'
// so saved files and the static-serve path always match.
const uploadsDir = path.join(__dirname, '../uploads/events');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${req.params.id}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .jpg, .jpeg, .png, and .webp images are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = upload;