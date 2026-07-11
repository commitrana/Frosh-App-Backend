const express = require('express');
const router = express.Router();
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const BootcampStudent = require('../models/BootcampStudent');
const Student = require('../models/Student');
const { authFaculty, authStudent } = require('../middleware/auth');

// Fetch the student's batch — checks BootcampStudent first (the authoritative
// source for batch assignments), falls back to Student.batch if not found there.
const getStudentBatch = async (email, studentId) => {
  const bootcampEntry = await BootcampStudent.findOne({ email }).select('batch');
  if (bootcampEntry) return bootcampEntry.batch;
  const studentEntry = await Student.findById(studentId).select('batch');
  return studentEntry?.batch ?? null;
};

// Distance between two lat/lng points, in meters.
function haversineMeters(a, b) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ============ FACULTY: Start Attendance Session ============
router.post('/session/start', authFaculty, async (req, res) => {
  try {
    const { subject, venue, day, slot, professorLocation, professorAccuracy, radiusMeters, batches } = req.body;

    if (!subject || !professorLocation || professorLocation.lat == null || professorLocation.lng == null) {
      return res.status(400).json({ error: 'subject and professorLocation {lat, lng} are required' });
    }

    const session = new AttendanceSession({
      faculty: req.faculty.id,
      subject: subject.trim(),
      venue: venue || '',
      day: day || '',
      slot: slot || '',
      batches: Array.isArray(batches) ? batches : [],
      anchorLocation: { lat: professorLocation.lat, lng: professorLocation.lng },
      anchorAccuracy: professorAccuracy || 20,
      radiusMeters: radiusMeters || 30
    });

    await session.save();
    console.log(`✅ Attendance session started: ${session.subject} by faculty ${req.faculty.id}`);

    res.status(201).json({
      message: 'Attendance session started!',
      session
    });
  } catch (error) {
    console.error('❌ Start attendance session error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Get Session Detail (for QR display) ============
router.get('/session/:id', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });
  } catch (error) {
    console.error('❌ Get attendance session error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Live Counts ============
router.get('/session/:id/live', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const [presentCount, flaggedCount, rejectedCount, totalMarked] = await Promise.all([
      AttendanceRecord.countDocuments({ session: session._id, status: 'present' }),
      AttendanceRecord.countDocuments({ session: session._id, status: 'flagged' }),
      AttendanceRecord.countDocuments({ session: session._id, status: 'rejected' }),
      AttendanceRecord.countDocuments({ session: session._id })
    ]);

    res.json({
      status: session.status,
      presentCount,
      flaggedCount,
      rejectedCount,
      totalMarked
    });
  } catch (error) {
    console.error('❌ Get live attendance error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Present Records (for the Present list) ============
router.get('/session/:id/present', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const records = await AttendanceRecord.find({
      session: session._id,
      status: 'present'
    })
      .populate('student', 'name rollNo branch')
      .sort({ scannedAt: 1 });

    res.json({ count: records.length, records });
  } catch (error) {
    console.error('❌ Get present records error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Flagged/Rejected Records (for review) ============
router.get('/session/:id/flagged', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const records = await AttendanceRecord.find({
      session: session._id,
      status: { $in: ['flagged', 'rejected'] }
    })
      .populate('student', 'name rollNo branch')
      .sort({ scannedAt: 1 });

    res.json({ count: records.length, records });
  } catch (error) {
    console.error('❌ Get flagged records error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Resolve a Flagged/Rejected Record ============
router.post('/session/:id/review', authFaculty, async (req, res) => {
  try {
    const { recordId, finalStatus } = req.body;

    if (!recordId || !['present', 'absent'].includes(finalStatus)) {
      return res.status(400).json({ error: "recordId and finalStatus ('present' | 'absent') are required" });
    }

    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const record = await AttendanceRecord.findOne({ _id: recordId, session: session._id });
    if (!record) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    record.finalStatus = finalStatus;
    record.reviewedByProfessor = true;
    await record.save();

    console.log(`✅ Attendance record reviewed: ${recordId} -> ${finalStatus}`);

    res.json({ message: 'Record reviewed', record });
  } catch (error) {
    console.error('❌ Review attendance record error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: End Session ============
router.post('/session/:id/end', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'ended') {
      return res.json({ message: 'Session already ended', session });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();

    console.log(`✅ Attendance session ended: ${session.subject}`);

    res.json({ message: 'Session ended', session });
  } catch (error) {
    console.error('❌ End attendance session error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: My Past Sessions ============
router.get('/faculty/sessions', authFaculty, async (req, res) => {
  try {
    const sessions = await AttendanceSession.find({ faculty: req.faculty.id }).sort({ startedAt: -1 });
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    console.error('❌ Get faculty sessions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Get Currently Active Session (if any) ============
// Powers the "Live Class" card in the Bootcamp screen — only shows a
// Mark Attendance option when a faculty member has an active session running.
router.get('/active', authStudent, async (req, res) => {
  try {
    const studentBatch = await getStudentBatch(req.student.email, req.student.id);

    const session = await AttendanceSession.findOne({ status: 'active' })
      .sort({ startedAt: -1 })
      .populate('faculty', 'name department');

    // Nothing active, or it's active but restricted to batches this
    // student isn't part of — either way, nothing to show them.
    const isForThisStudent =
      session && (session.batches.length === 0 || (studentBatch && session.batches.includes(studentBatch)));

    if (!session || !isForThisStudent) {
      return res.json({ session: null, alreadyMarked: false, myStatus: null });
    }

    const existingRecord = await AttendanceRecord.findOne({
      session: session._id,
      student: req.student.id
    });

    res.json({
      session: {
        _id: session._id,
        subject: session.subject,
        venue: session.venue,
        day: session.day,
        slot: session.slot,
        startedAt: session.startedAt,
        faculty: session.faculty ? { name: session.faculty.name, department: session.faculty.department } : null
      },
      alreadyMarked: !!existingRecord,
      myStatus: existingRecord ? existingRecord.status : null
    });
  } catch (error) {
    console.error('❌ Get active session error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});
// ============ FACULTY: Manual Attendance ============
router.post('/session/:id/manual', authFaculty, async (req, res) => {
  try {
    const { studentId } = req.body;
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // ✅ Check if already marked
    const existing = await AttendanceRecord.findOne({ session: session._id, student: studentId });
    if (existing) {
      // ✅ If already marked but status is not present, update to present
      if (existing.status !== 'present') {
        existing.status = 'present';
        existing.finalStatus = 'present';
        existing.reviewedByProfessor = true;
        await existing.save();
        return res.json({ message: 'Student marked present', record: existing });
      }
      return res.status(400).json({ error: 'Student already marked present' });
    }

    // ✅ Check if student exists
    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // ✅ Create manual attendance record
    const record = new AttendanceRecord({
      session: session._id,
      student: studentId,
      studentLocation: { lat: 0, lng: 0 },
      studentAccuracy: 0,
      distanceFromAnchor: 0,
      status: 'present',
      reviewedByProfessor: true,
      finalStatus: 'present'
    });

    await record.save();
    res.json({ message: 'Attendance marked manually', record });
  } catch (error) {
    console.error('❌ Manual attendance error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Get All Students with Attendance Status ============
router.get('/session/:id/students', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // ✅ Get ALL students from ALL batches (not just session batches)
    // Session batches = which batches were allowed to attend this class
    const sessionBatches = session.batches.length > 0 ? session.batches : [];
    
    // Get all students (not filtered by batch - we want ALL students)
    const allStudents = await Student.find({}).select('name rollNo email batch');

    // ✅ Get attendance records for this session
    const records = await AttendanceRecord.find({ session: session._id });

    // ✅ Merge data - mark absent for students who didn't scan
    const result = allStudents.map(student => {
      const record = records.find(r => r.student.toString() === student._id.toString());
      const isAllowed = sessionBatches.length === 0 || sessionBatches.includes(student.batch);
      
      return {
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        email: student.email,
        batch: student.batch || 'Not Assigned',
        // ✅ If student's batch was allowed but didn't scan = absent
        // ✅ If student's batch was NOT allowed = 'not_in_batch'
        status: record ? record.status : (isAllowed ? 'absent' : 'not_in_batch'),
        distance: record ? record.distanceFromAnchor : null,
        reviewed: record ? record.reviewedByProfessor : false,
        isAllowed: isAllowed
      };
    });

    // ✅ Sort: Present first, then Absent, then Not in batch
    const sorted = result.sort((a, b) => {
      const order = { present: 0, absent: 1, flagged: 2, rejected: 3, not_in_batch: 4 };
      return (order[a.status] || 5) - (order[b.status] || 5);
    });

    res.json({ 
      count: sorted.length, 
      students: sorted,
      sessionBatches: sessionBatches
    });
  } catch (error) {
    console.error('❌ Get students error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;