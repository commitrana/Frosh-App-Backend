const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const BootcampStudent = require('../models/BootcampStudent');
const Faculty = require('../models/Faculty');
const { authAdmin, authStudent, authGroupViewer } = require('../middleware/auth');

// ============ SPECIAL ACCESS: hardcoded id/password pairs that log
// straight into the "view any group's timetable" experience via the
// app's normal /login page — no separate unlock UI, no visible hint to
// regular students that this exists. This is the ONLY place these
// credentials live; the frontend never sees this list, it just tries these
// against POST /group-viewer/login (below) as a fallback if a normal
// student/faculty login fails. Edit this list to add/remove people.
const GROUP_VIEWER_ACCESS = [
  { id: 'dosa@thapar.edu', password: 'admin123' },
  { id: 'doaa@thapar.edu', password: 'admin123' },
  { id: 'frosh@thapar.edu', password: 'admin123' },
  // Add more { id, password } rows here as needed.
];

const isValidGroupViewer = (id, password) =>
  GROUP_VIEWER_ACCESS.some((entry) => entry.id === id && entry.password === password);

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
    // A student's batch can be changed by an admin. Never allow a device or
    // intermediary to reuse an older value for this live lookup.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const entry = await BootcampStudent.findOne({ email: req.student.email });
    res.json({ batch: entry ? entry.batch : null });
  } catch (error) {
    console.error('❌ Get my batch error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Builds a structured timetable (grouped by day, sorted by time) for a
// given batch code — scans every faculty's schedule and keeps only
// lectures assigned to that batch (or open to everyone). Shared by both
// the student-facing /my-timetable route and the admin-facing
// /admin/batch-schedule/:batchCode route, so there's exactly one place
// this logic lives.
const buildTimetableForBatch = async (batchCode) => {
  const allFaculty = await Faculty.find({}).select('name department timetable');

  const classes = [];
  const daySet = new Set();
  const slotSet = new Set();

  allFaculty.forEach((faculty) => {
    const schedule = faculty?.timetable?.schedule;
    if (!schedule || typeof schedule !== 'object') return;

    Object.keys(schedule).forEach((day) => {
      const daySchedule = schedule[day];
      if (!daySchedule || typeof daySchedule !== 'object') return;

      Object.keys(daySchedule).forEach((slot) => {
        const lecture = daySchedule[slot];
        if (!lecture || !lecture.subject) return;

        const lectureBatches = Array.isArray(lecture.batches) ? lecture.batches : [];
        const isForThisBatch =
          lectureBatches.length === 0 || lectureBatches.includes(batchCode);

        if (!isForThisBatch) return;

        daySet.add(day);
        slotSet.add(slot);
        classes.push({
          day,
          slot,
          subject: lecture.subject,
          venue: lecture.venue || '',
          faculty: faculty.name,
          department: faculty.department || ''
        });
      });
    });
  });

  const slotStart = (slot) => slot.split('-')[0]?.trim() || slot;
  const timeSlots = Array.from(slotSet).sort((a, b) => slotStart(a).localeCompare(slotStart(b)));

  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const days = Array.from(daySet).sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));

  return { batch: batchCode, days, timeSlots, classes };
};

// ============ STUDENT: Get my actual class timetable ============
// Builds a real, structured timetable for this student by scanning every
// faculty's schedule (the same data the admin panel edits in the "Class
// Schedule" screen) and keeping only the lectures assigned to this
// student's batch — no separate "student timetable" data to maintain,
// it's always derived live from the faculty side, so it can never drift
// out of sync with what admin/faculty actually configured.
router.get('/my-timetable', authStudent, async (req, res) => {
  try {
    // This response is calculated from all faculty schedules on every
    // request. Mark it explicitly dynamic so a newly saved faculty schedule
    // cannot be hidden behind a cached GET response on the student app.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const entry = await BootcampStudent.findOne({ email: req.student.email }).select('batch');
    const studentBatch = entry ? entry.batch : null;

    if (!studentBatch) {
      return res.json({ batch: null, days: [], timeSlots: [], classes: [] });
    }

    const timetable = await buildTimetableForBatch(studentBatch);
    res.json(timetable);
  } catch (error) {
    console.error('❌ Get my timetable error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ ADMIN: Get any batch's class schedule ============
// Same underlying data as /my-timetable, but for admins to look up any
// batch by code — powers the "View Schedule" button on the Batches page.
router.get('/admin/batch-schedule/:batchCode', authAdmin, async (req, res) => {
  try {
    const timetable = await buildTimetableForBatch(req.params.batchCode);
    res.json(timetable);
  } catch (error) {
    console.error('❌ Get admin batch schedule error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ SPECIAL ACCESS: log in as a group viewer ============
// Tried by the frontend's loginUnified() as a fallback ONLY after both the
// real student login and the real faculty login have already failed with
// 401 — so this never interferes with normal accounts, and there is no
// separate screen or visible hint anywhere in the app that this exists.
// On a match, issues a normal-looking JWT (same shape/expiry as student
// and faculty tokens) but with role: 'groupViewer', which authGroupViewer
// below checks for. Not tied to the Student/Faculty collections at all.
router.post('/group-viewer/login', async (req, res) => {
  try {
    const id = String(req.body?.email || req.body?.id || '').trim();
    const password = String(req.body?.password || '');

    if (!isValidGroupViewer(id, password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { role: 'groupViewer', viewerId: id },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );

    res.json({ token, groupViewer: { id } });
  } catch (error) {
    console.error('❌ Group viewer login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ SPECIAL ACCESS: Get any batch's class schedule ============
// Same underlying data + logic as /admin/batch-schedule/:batchCode, but
// gated by authGroupViewer instead of admin or student login — only a
// token from a successful POST /group-viewer/login above can reach this.
// A normal student/faculty token does NOT work here, and vice versa.
router.get('/batch-schedule/:batchCode', authGroupViewer, async (req, res) => {
  try {
    const batchCode = (req.params.batchCode || '').trim();

    if (!ALL_BATCHES.includes(batchCode)) {
      return res.status(400).json({
        error: `"${batchCode}" isn't a valid batch code. Use one of: ${ALL_BATCHES.join(', ')}`
      });
    }

    // Same reasoning as /my-timetable — never let this be cached, since an
    // admin could update the faculty schedule at any time.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const timetable = await buildTimetableForBatch(batchCode);
    res.json(timetable);
  } catch (error) {
    console.error('❌ Get batch schedule error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
