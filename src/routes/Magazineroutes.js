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

// Wraps upload.single('pdf') so Multer errors (file too large, wrong type,
// a broken/truncated multipart body, etc.) get turned into a clean JSON
// response instead of propagating as a raw error mid-request. Previously,
// a MulterError (e.g. "File too large") would blow up before the route's
// own try/catch ever ran, and the request would end without a proper
// response — which is what showed up in the browser as a CORS error, even
// though the real cause was just an oversized PDF.
function uploadPdf(req, res, next) {
  upload.single('pdf')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'PDF is too large — max size is 60MB. Try compressing it first.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}

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
  uploadPdf,
  async (req, res) => {
    const issueNumber = Number(req.params.issueNumber);
    if (!Number.isInteger(issueNumber) || issueNumber < 1) {
      return res.status(400).json({ error: 'Invalid issue number' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'PDF file is required' });
    }

    // Everything below is now inside one try/catch — previously the
    // find/save above this comment sat OUTSIDE any try/catch, so any
    // failure there (a Mongo hiccup, a validation error, etc.) became an
    // unhandled promise rejection. Since Node 15+, an unhandled rejection
    // crashes the whole process by default — not just this one request.
    // That's what was producing the "responded with 500" + "blocked by
    // CORS" + "net::ERR_FAILED" combo in the browser: the server process
    // was dying mid-request, so the response (and its CORS header) never
    // actually got sent — the browser was just seeing a dropped connection.
    let magazine;
    try {
      magazine = await Magazine.findOne({ issueNumber });
      if (!magazine) {
        magazine = new Magazine({ issueNumber, title: req.body.title || `Issue ${issueNumber}` });
      }
      magazine.status = 'processing';
      magazine.error = '';
      await magazine.save();

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
      if (magazine) {
        magazine.status = 'failed';
        magazine.error = err.message || 'Conversion failed';
        // Don't let a save failure here throw again inside the catch block.
        await magazine.save().catch((saveErr) =>
          console.error('Also failed to persist failed status:', saveErr)
        );
      }
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