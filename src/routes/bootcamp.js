const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const BootcampStudent = require('../models/BootcampStudent');
const { authAdmin, authStudent } = require('../middleware/auth');

// 10 colors x 2 sections (A/B) = 20 valid batch codes
const COLORS = ['Red', 'Blue', 'Black', 'Pink', 'Purple', 'Yellow', 'Green', 'Orange', 'White', 'Brown'];
const ALL_BATCHES = COLORS.flatMap((color) => [`${color}A`, `${color}B`]);

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// ============ ADMIN: Get the list of all 20 valid batch codes ============
router.get('/admin/batches', authAdmin, async (req, res) => {
  res.json({ batches: ALL_BATCHES });
});

// ============ ADMIN: Get the full bootcamp roster (with "verified" flag) ============
router.get('/admin/list', authAdmin, async (req, res) => {
  try {
    const bootcampStudents = await BootcampStudent.find().sort({ batch: 1, name: 1 });

    // Cross-check every bootcamp email against the real Student list in one query
    const emails = bootcampStudents.map((s) => s.email);
    const realStudents = await Student.find({ email: { $in: emails } }).select('email');
    const verifiedEmails = new Set(realStudents.map((s) => s.email));

    const students = bootcampStudents.map((s) => ({
      _id: s._id,
      name: s.name,
      email: s.email,
      phoneNo: s.phoneNo,
      batch: s.batch,
      verified: verifiedEmails.has(s.email)
    }));

    res.json({
      count: students.length,
      verifiedCount: students.filter((s) => s.verified).length,
      students
    });
  } catch (error) {
    console.error('❌ Get bootcamp list error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Bulk import bootcamp roster from CSV (name, email, phoneNo, batch) ============
router.post('/admin/import', authAdmin, async (req, res) => {
  try {
    const { students } = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: 'No student rows provided' });
    }

    let imported = 0;
    let invalidBatchCount = 0;
    const skipped = [];

    for (const row of students) {
      const name = (row.name || '').trim();
      const email = (row.email || '').trim().toLowerCase();
      const phoneNo = (row.phoneno || row.phoneNo || '').trim();
      let batch = (row.batch || '').trim();

      if (!name || !email) {
        skipped.push({ email: email || '(missing)', reason: 'Missing name or email' });
        continue;
      }

      if (batch && !ALL_BATCHES.includes(batch)) {
        invalidBatchCount++;
        batch = null; // keep the row, just leave batch unset if it's not a real batch code
      }

      await BootcampStudent.findOneAndUpdate(
        { email },
        { name, email, phoneNo, batch: batch || null, updatedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      imported++;
    }

    console.log(`✅ Bootcamp CSV import: ${imported} rows imported`);

    res.json({
      message: `Imported ${imported} students${invalidBatchCount ? ` (${invalidBatchCount} had an unrecognized batch code and were left unassigned)` : ''}`,
      imported,
      invalidBatchCount,
      skipped
    });
  } catch (error) {
    console.error('❌ Bootcamp import error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Edit a single bootcamp student's batch (freeform, no uniqueness constraint) ============
router.put('/admin/:id', authAdmin, async (req, res) => {
  try {
    const { batch } = req.body;
    const trimmed = (batch || '').trim();

    if (trimmed && !ALL_BATCHES.includes(trimmed)) {
      return res.status(400).json({
        error: `"${trimmed}" isn't a valid batch code. Use one of: ${ALL_BATCHES.join(', ')}`
      });
    }

    const student = await BootcampStudent.findByIdAndUpdate(
      req.params.id,
      { batch: trimmed || null, updatedAt: new Date() },
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Bootcamp student not found' });
    }

    console.log(`✅ Updated batch for ${student.name}: ${trimmed || '(cleared)'}`);

    res.json({ message: 'Batch updated successfully', student });
  } catch (error) {
    console.error('❌ Update bootcamp batch error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Randomly (re)shuffle batches evenly across everyone in the roster ============
router.post('/admin/shuffle', authAdmin, async (req, res) => {
  try {
    const bootcampStudents = await BootcampStudent.find();

    if (bootcampStudents.length === 0) {
      return res.status(400).json({ error: 'No bootcamp students to assign. Import a CSV first.' });
    }

    const shuffled = shuffle(bootcampStudents);

    // Distribute as evenly as possible across the 20 batches, round-robin style
    for (let i = 0; i < shuffled.length; i++) {
      shuffled[i].batch = ALL_BATCHES[i % ALL_BATCHES.length];
      await shuffled[i].save();
    }

    console.log(`✅ Bootcamp: shuffled ${shuffled.length} students across 20 batches`);

    res.json({ message: `Shuffled ${shuffled.length} students across 20 batches`, count: shuffled.length });
  } catch (error) {
    console.error('❌ Shuffle bootcamp batches error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Get my own batch (used by the app's Bootcamp tab) ============
router.get('/my-batch', authStudent, async (req, res) => {
  try {
    const entry = await BootcampStudent.findOne({ email: req.student.email });
    res.json({ batch: entry ? entry.batch : null });
  } catch (error) {
    console.error('❌ Get my batch error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;