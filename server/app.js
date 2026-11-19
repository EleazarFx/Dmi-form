'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const express = require('express');
const multer = require('multer');
const { validateApplication } = require('./validation');
const { saveApplication, listApplications, getApplication } = require('./db');

const ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, UPLOAD_DIR),
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase();
    callback(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 200 },
});

function discardUpload(file) {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
}

// --- API -------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Server is running.' });
});

app.post('/api/applications', upload.single('passport-photo'), (req, res) => {
  const { errors, value } = validateApplication(req.body, req.file);

  if (Object.keys(errors).length > 0) {
    discardUpload(req.file);
    return res.status(400).json({
      ok: false,
      message: 'Please correct the highlighted fields and submit again.',
      errors,
    });
  }

  try {
    const applicationNumber = saveApplication(value, `/uploads/${req.file.filename}`);
    return res.status(201).json({
      ok: true,
      applicationNumber,
      message: 'Your application has been received.',
    });
  } catch (error) {
    discardUpload(req.file);
    console.error('Failed to save application:', error);
    return res.status(500).json({ ok: false, message: 'The application could not be saved. Please try again.' });
  }
});

app.get('/api/applications', (req, res) => {
  res.json({ ok: true, applications: listApplications() });
});

app.get('/api/applications/:number', (req, res) => {
  const application = getApplication(req.params.number.toUpperCase());
  if (!application) {
    return res.status(404).json({ ok: false, message: 'Application not found.' });
  }
  res.json({ ok: true, application });
});

// --- Frontend assets --------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/images', express.static(path.join(ROOT, 'images')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, message: 'API endpoint not found.' });
});

// --- Error handling ---------------------------------------------------------
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error?.name === 'MulterError') {
    let message = 'The photo could not be uploaded.';
    if (error.code === 'LIMIT_FILE_SIZE') message = 'The photo must be smaller than 5 MB.';
    else if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(error.code)) message = 'Upload only one passport photo.';
    else if (error.code === 'LIMIT_FIELD_COUNT') message = 'The form contains too many fields.';

    discardUpload(error.file);
    return res.status(400).json({
      ok: false,
      message: 'Please correct the highlighted fields and submit again.',
      errors: { 'passport-photo': message },
    });
  }

  console.error(error);
  res.status(500).json({ ok: false, message: 'An unexpected server error occurred.' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`DMI application server running at http://localhost:${PORT}`);
});
