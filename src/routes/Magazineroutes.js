const express = require('express');
const multer = require('multer');
const Magazine = require('../models/Magazine');
const { supabase } = require('../utils/supabaseUpload');
const MAGAZINE_BUCKET = 'magazines';
const { convertPdfToJpegBuffers } = require('../utils/convertPdfToImages');
const { authAdmin } = require('../middleware/auth');

const router = express.Router();

// The PDF is held only in RAM (memoryStorage) — never written to disk —
// and the buffer is thrown away as soon as conversion finishes. Only the
// converted JPEG pages get uploaded to Supabase.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB, adjust to taste
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
});

async function deleteIssuePages(issueNumber) {
  const prefix = `issue-${issueNumber}`;
  const { data: files, error: listError } = await supabase.storage
    .from(MAGAZINE_BUCKET)
    .list(prefix);
  if (listError || !files?.length) return;
  const paths = files.map((f) => `${prefix}/${f.name}`);
  await supabase.storage.from(MAGAZINE_BUCKET).remove(paths);
}

async function uploadPages(issueNumber, jpegBuffers) {
  const urls = [];
  for (let i = 0; i < jpegBuffers.length; i++) {
    const pageNum = String(i + 1).padStart(2, '0');
    const path = `issue-${issueNumber}/page-${pageNum}.jpg`;
    const { error } = await supabase.storage
      .from(MAGAZINE_BUCKET)
      .upload(path, jpegBuffers[i], { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(MAGAZINE_BUCKET).getPublicUrl(path);
    urls.push(data.publicUrl);
  }
  return urls;
}

// ============ ADMIN ROUTES (dashboard) ============

// List every issue, in order — used to render the Magazine tab's list.
router.get('/admin/magazines', authAdmin, async (req, res) => {
  try {
    const magazines = await Magazine.find().sort({ issueNumber: 1 });
    res.json({ magazines });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch magazines' });
  }
});

// Upload (or replace) the PDF for one issue number. Converts it to JPEG
// pages synchronously and responds once done — for a normal magazine PDF
// this is typically a few seconds to under a minute. The dashboard shows
// a "processing" badge on the card while it waits.
router.post(
  '/admin/magazines/:issueNumber/upload',
  authAdmin,
  upload.single('pdf'),
  async (req, res) => {
    const issueNumber = Number(req.params.issueNumber);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      return res.status(400).json({ error: 'Invalid issue number' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    let magazine = await Magazine.findOne({ issueNumber });
    if (!magazine) {
      magazine = new Magazine({ issueNumber, title: req.body.title || `Issue ${issueNumber}` });
    }
    magazine.status = 'processing';
    magazine.error = '';
    await magazine.save();

    try {
      // Clear any previously-converted pages for this issue first, so
      // replacing a PDF doesn't leave old orphaned pages behind in storage.
      await deleteIssuePages(issueNumber);

      const jpegBuffers = await convertPdfToJpegBuffers(req.file.buffer);
      if (!jpegBuffers.length) throw new Error('PDF produced no pages');

      const urls = await uploadPages(issueNumber, jpegBuffers);

      magazine.pages = urls;
      magazine.pageCount = urls.length;
      magazine.status = 'ready';
      await magazine.save();

      res.json({ success: true, magazine });
    } catch (err) {
      console.error('Magazine conversion failed:', err);
      magazine.status = 'failed';
      magazine.error = err.message || 'Conversion failed';
      await magazine.save();
      res.status(500).json({ error: 'Failed to convert PDF', details: err.message });
    }
  }
);

router.patch('/admin/magazines/:issueNumber', authAdmin, async (req, res) => {
  const magazine = await Magazine.findOne({ issueNumber: Number(req.params.issueNumber) });
  if (!magazine) return res.status(404).json({ error: 'Issue not found' });
  if (typeof req.body.title === 'string') magazine.title = req.body.title;
  await magazine.save();
  res.json({ success: true, magazine });
});

router.delete('/admin/magazines/:issueNumber', authAdmin, async (req, res) => {
  try {
    const issueNumber = Number(req.params.issueNumber);
    await deleteIssuePages(issueNumber);
    await Magazine.deleteOne({ issueNumber });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete issue' });
  }
});

// ============ PUBLIC ROUTES (consumed by the mobile app) ============

// Lightweight list of ready issues — for an "issues" picker screen if you
// build one later (e.g. a grid of magazine covers to choose from).
router.get('/magazines', async (req, res) => {
  const magazines = await Magazine.find({ status: 'ready' })
    .sort({ issueNumber: -1 })
    .select('issueNumber title pageCount createdAt');
  res.json({ magazines });
});

// Latest ready issue — used when MagazineScreen opens without a specific
// issue number picked (e.g. tapping "Pulse Magazine" from the home screen).
router.get('/magazines/latest/pages', async (req, res) => {
  const magazine = await Magazine.findOne({ status: 'ready' }).sort({ issueNumber: -1 });
  if (!magazine) return res.status(404).json({ error: 'No magazine issues available yet' });
  res.json({ magazine });
});

// Full page list for one specific issue.
router.get('/magazines/:issueNumber', async (req, res) => {
  const magazine = await Magazine.findOne({
    issueNumber: Number(req.params.issueNumber),
    status: 'ready',
  });
  if (!magazine) return res.status(404).json({ error: 'Issue not found' });
  res.json({ magazine });
});

module.exports = router;