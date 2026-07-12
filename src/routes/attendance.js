const express = require('express');
const router = express.Router();
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const BootcampStudent = require('../models/BootcampStudent');
const Student = require('../models/Student');
const FeedbackResponse = require('../models/FeedbackResponse');
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

// ============ FACULTY: Today's Session For This Slot (if any) ============
// Lets ClassDetails know whether a session for this exact day+slot was
// already started today — so it can show "View Attendance" instead of
// letting the professor start a second session for a class already run.
// IMPORTANT: this must be registered BEFORE 'GET /session/:id' below —
// otherwise Express matches "today" as the :id param and Mongoose throws
// a CastError trying to treat "today" as an ObjectId.
router.get('/session/today', authFaculty, async (req, res) => {
  try {
    const { day, slot } = req.query;
    if (!day || !slot) {
      return res.status(400).json({ error: 'day and slot query params are required' });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const session = await AttendanceSession.findOne({
      faculty: req.faculty.id,
      day,
      slot,
      startedAt: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ startedAt: -1 });

    res.json({ session: session || null });
  } catch (error) {
    console.error('❌ Get today session error:', error);
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

// ============ FACULTY: Full Roster For This Session (present + absent) ============
// Every student in the session's allowed batches, with their current
// attendance status — powers the "Manage Attendance" search + manual-mark screen.
router.get('/session/:id/roster', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const sessionBatches = Array.isArray(session.batches) ? session.batches : [];

    let students;
    if (sessionBatches.length > 0) {
      // Batch assignments live authoritatively in BootcampStudent (via email),
      // with Student.batch as a secondary source — same priority as
      // getStudentBatch() above. Pull from both so nobody gets missed.
      const [bootcampEntries, directMatches] = await Promise.all([
        BootcampStudent.find({ batch: { $in: sessionBatches } }).select('email batch'),
        Student.find({ batch: { $in: sessionBatches } }).select('email batch')
      ]);

      const batchByEmail = {};
      directMatches.forEach((s) => { batchByEmail[s.email] = s.batch; });
      // BootcampStudent takes priority if both exist for the same email.
      bootcampEntries.forEach((b) => { batchByEmail[b.email] = b.batch; });

      const emails = Object.keys(batchByEmail);
      const matchedStudents = await Student.find({ email: { $in: emails } })
        .select('name rollNo branch batch email')
        .sort({ name: 1 });

      students = matchedStudents.map((s) => ({
        _id: s._id,
        name: s.name,
        rollNo: s.rollNo,
        branch: s.branch,
        batch: batchByEmail[s.email] || s.batch
      }));
    } else {
      const allStudents = await Student.find({}).select('name rollNo branch batch').sort({ name: 1 });
      students = allStudents.map((s) => ({
        _id: s._id,
        name: s.name,
        rollNo: s.rollNo,
        branch: s.branch,
        batch: s.batch
      }));
    }

    const records = await AttendanceRecord.find({ session: session._id });

    const recordByStudentId = {};
    records.forEach((r) => {
      recordByStudentId[r.student.toString()] = r;
    });

    const roster = students.map((s) => {
      const record = recordByStudentId[s._id.toString()];
      return {
        _id: s._id,
        name: s.name,
        rollNo: s.rollNo,
        branch: s.branch,
        batch: s.batch,
        status: record ? record.status : 'absent',
        markedManually: record ? !!record.markedManually : false,
        recordId: record ? record._id : null
      };
    });

    res.json({ count: roster.length, students: roster });
  } catch (error) {
    console.error('❌ Get session roster error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Manually Mark a Student Present ============
// For students who were physically present but didn't scan (no signal,
// forgot, phone died, etc). Creates or updates their record to 'present'.
router.post('/session/:id/mark-manual', authFaculty, async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }

    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let record = await AttendanceRecord.findOne({ session: session._id, student: studentId });

    if (record) {
      if (record.status === 'present' && !record.markedManually) {
        return res.status(400).json({ error: 'This student already scanned and is marked present.' });
      }
      record.status = 'present';
      record.markedManually = true;
      record.reviewedByProfessor = true;
      record.finalStatus = 'present';
      await record.save();
    } else {
      record = new AttendanceRecord({
        session: session._id,
        student: studentId,
        status: 'present',
        markedManually: true,
        reviewedByProfessor: true,
        finalStatus: 'present'
      });
      await record.save();
    }

    console.log(`✅ Student ${studentId} manually marked present for session ${session._id}`);

    res.json({ message: 'Marked present', record });
  } catch (error) {
    console.error('❌ Manual mark error:', error);
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

    if (!session) {
      // No live attendance right now — check whether this student has
      // feedback waiting for them (a session they attended where the
      // faculty has since started feedback and they haven't submitted yet).
      const myRecords = await AttendanceRecord.find({
        student: req.student.id,
        status: { $in: ['present', 'flagged'] }
      }).select('session');
      const sessionIds = myRecords.map((r) => r.session);

      const feedbackSession = sessionIds.length
        ? await AttendanceSession.findOne({ _id: { $in: sessionIds }, feedbackStatus: 'open' })
            .sort({ feedbackStartedAt: -1 })
            .populate('faculty', 'name department')
        : null;

      if (!feedbackSession) {
        return res.json({ session: null, alreadyMarked: false, myStatus: null, type: 'attendance' });
      }

      const alreadySubmitted = await FeedbackResponse.findOne({
        session: feedbackSession._id,
        student: req.student.id
      });

      if (alreadySubmitted) {
        return res.json({ session: null, alreadyMarked: false, myStatus: null, type: 'attendance' });
      }

      return res.json({
        type: 'feedback',
        session: {
          _id: feedbackSession._id,
          subject: feedbackSession.subject,
          venue: feedbackSession.venue,
          day: feedbackSession.day,
          slot: feedbackSession.slot,
          startedAt: feedbackSession.startedAt,
          faculty: feedbackSession.faculty
            ? { name: feedbackSession.faculty.name, department: feedbackSession.faculty.department }
            : null
        },
        alreadyMarked: false,
        myStatus: null
      });
    }

    // Defensive fallback: sessions created before the batches field existed
    // won't have it on the document at all (Mongoose defaults only apply to
    // brand-new documents, not ones already sitting in the DB).
    const sessionBatches = Array.isArray(session.batches) ? session.batches : [];

    // Nothing active, or it's active but restricted to batches this
    // student isn't part of — either way, nothing to show them.
    const isForThisStudent =
      sessionBatches.length === 0 || (studentBatch && sessionBatches.includes(studentBatch));

    if (!isForThisStudent) {
      return res.json({ session: null, alreadyMarked: false, myStatus: null, type: 'attendance' });
    }

    const existingRecord = await AttendanceRecord.findOne({
      session: session._id,
      student: req.student.id
    });

    res.json({
      type: 'attendance',
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

// ============ STUDENT: Scan QR & Mark Attendance ============
router.post('/mark', authStudent, async (req, res) => {
  try {
    const { qrToken, studentGPS, studentAccuracy } = req.body;

    if (!qrToken || !studentGPS || studentGPS.lat == null || studentGPS.lng == null) {
      return res.status(400).json({ error: 'qrToken and studentGPS {lat, lng} are required' });
    }

    const session = await AttendanceSession.findOne({ qrToken });
    if (!session) {
      return res.status(404).json({ error: 'Invalid QR code. This attendance session was not found.' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ error: 'This attendance session has already ended.' });
    }

    // Defensive fallback — see note in GET /active above.
    const sessionBatches = Array.isArray(session.batches) ? session.batches : [];

    if (sessionBatches.length > 0) {
      const studentBatch = await getStudentBatch(req.student.email, req.student.id);
      if (!studentBatch || !sessionBatches.includes(studentBatch)) {
        return res.status(403).json({ error: 'This class is not for your batch.' });
      }
    }

    // Two-tier geofence check.
    const accuracy = studentAccuracy || 20;
    const distance = haversineMeters(session.anchorLocation, studentGPS);
    const effectiveRadius =
      session.radiusMeters + Math.min(accuracy, 50) + Math.min(session.anchorAccuracy, 30);

    let status;
    if (distance <= effectiveRadius) {
      status = 'present';
    } else if (distance <= effectiveRadius * 1.5) {
      status = 'flagged';
    } else {
      status = 'rejected';
    }

    const record = new AttendanceRecord({
      session: session._id,
      student: req.student.id,
      studentLocation: { lat: studentGPS.lat, lng: studentGPS.lng },
      studentAccuracy: accuracy,
      distanceFromAnchor: Math.round(distance),
      status
    });

    await record.save();

    console.log(`✅ Attendance marked: student ${req.student.id} -> ${status} (${Math.round(distance)}m)`);

    res.status(201).json({
      message:
        status === 'present'
          ? 'Marked present!'
          : status === 'flagged'
          ? 'Marked present — pending professor review'
          : "Couldn't verify your location. Please ask your professor to mark you manually.",
      status,
      distanceFromAnchor: Math.round(distance)
    });
  } catch (error) {
    // Duplicate key = this student already scanned for this session
    if (error.code === 11000) {
      return res.status(400).json({ error: 'You have already marked attendance for this session.' });
    }
    console.error('❌ Mark attendance error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;