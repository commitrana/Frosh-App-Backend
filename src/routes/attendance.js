const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const BootcampStudent = require('../models/BootcampStudent');
const Student = require('../models/Student');
const Faculty = require('../models/Faculty');
const { authAdmin, authFaculty, authStudent } = require('../middleware/auth');

// Fetch the student's batch — checks BootcampStudent first (the authoritative
// source for batch assignments), falls back to Student.batch if not found there.
const getStudentBatch = async (email, studentId) => {
  const bootcampEntry = await BootcampStudent.findOne({ email }).select('batch');
  if (bootcampEntry) {
    console.log(`🎯 getStudentBatch(${email}) -> '${bootcampEntry.batch}' (from BootcampStudent)`);
    return bootcampEntry.batch;
  }
  const studentEntry = await Student.findById(studentId).select('batch');
  console.log(`⚠️ getStudentBatch(${email}) -> no BootcampStudent match, falling back to Student.batch = '${studentEntry?.batch}'`);
  return studentEntry?.batch ?? null;
};

// Build one consistent class roster for faculty and admin views. A
// flagged/rejected scan is absent unless the professor explicitly resolved it
// as present; students without an attendance record are absent.
const buildSessionRoster = async (session) => {
  const sessionBatches = Array.isArray(session.batches) ? session.batches : [];
  let students;

  if (sessionBatches.length > 0) {
    const [allBootcampEntries, allStudents] = await Promise.all([
      BootcampStudent.find({}).select('email batch'),
      Student.find({}).select('name rollNo branch batch email').sort({ name: 1 })
    ]);
    const bootcampByEmail = {};
    allBootcampEntries.forEach((entry) => { bootcampByEmail[entry.email] = entry.batch; });
    students = allStudents
      .map((student) => ({
        _id: student._id,
        name: student.name,
        rollNo: student.rollNo,
        branch: student.branch,
        batch: Object.prototype.hasOwnProperty.call(bootcampByEmail, student.email)
          ? bootcampByEmail[student.email]
          : student.batch
      }))
      .filter((student) => sessionBatches.includes(student.batch));
  } else {
    const allStudents = await Student.find({}).select('name rollNo branch batch').sort({ name: 1 });
    students = allStudents.map((student) => ({
      _id: student._id,
      name: student.name,
      rollNo: student.rollNo,
      branch: student.branch,
      batch: student.batch
    }));
  }

  const records = await AttendanceRecord.find({ session: session._id });
  const recordByStudentId = {};
  records.forEach((record) => { recordByStudentId[record.student.toString()] = record; });

  return students.map((student) => {
    const record = recordByStudentId[student._id.toString()];
    // A scan/code entry only counts as present once the student has also
    // submitted their mandatory feedback (feedbackCompleted). Manual marks
    // and legacy records default feedbackCompleted to true, so they're
    // unaffected.
    const isPresent =
      record &&
      record.feedbackCompleted !== false &&
      (record.finalStatus === 'present' || (!record.finalStatus && record.status === 'present'));
    return {
      _id: student._id,
      name: student.name,
      rollNo: student.rollNo,
      branch: student.branch,
      batch: student.batch,
      status: isPresent ? 'present' : 'absent',
      markedManually: record ? !!record.markedManually : false,
      pendingFeedback: !!(record && record.feedbackCompleted === false)
    };
  });
};

// ============ ADMIN: Completed class history ============
router.get('/admin/history/faculty', authAdmin, async (req, res) => {
  try {
    const [faculty, sessions] = await Promise.all([
      Faculty.find({}).select('name department').sort({ name: 1 }),
      AttendanceSession.find({ status: 'ended' }).select('faculty')
    ]);
    const completedCountByFaculty = {};
    sessions.forEach((session) => {
      const id = session.faculty.toString();
      completedCountByFaculty[id] = (completedCountByFaculty[id] || 0) + 1;
    });
    res.json({
      faculty: faculty.map((member) => ({
        _id: member._id,
        name: member.name,
        department: member.department,
        completedClasses: completedCountByFaculty[member._id.toString()] || 0
      }))
    });
  } catch (error) {
    console.error('Get admin class-history faculty error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.get('/admin/history/faculty/:facultyId/sessions', authAdmin, async (req, res) => {
  try {
    const sessions = await AttendanceSession.find({
      faculty: req.params.facultyId,
      status: 'ended'
    }).select('subject venue day slot batches startedAt endedAt').sort({ endedAt: -1 });
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    console.error('Get admin class-history sessions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

router.get('/admin/history/session/:sessionId/roster', authAdmin, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.sessionId, status: 'ended' });
    if (!session) return res.status(404).json({ error: 'Completed class not found' });
    const students = await buildSessionRoster(session);
    res.json({ count: students.length, students });
  } catch (error) {
    console.error('Get admin class-history roster error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ FACULTY: Own completed class history ============
// Read-only list of this faculty's own ended sessions, most recent first —
// powers the "Class History" screen in the app (separate from the live
// "My Past Sessions" list at /faculty/sessions, which includes active ones).
router.get('/faculty/history/sessions', authFaculty, async (req, res) => {
  try {
    const sessions = await AttendanceSession.find({
      faculty: req.faculty.id,
      status: 'ended'
    }).select('subject venue day slot batches startedAt endedAt').sort({ endedAt: -1 });
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    console.error('❌ Get faculty class-history sessions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Own class history ============
// Read-only history of this student's own classes — every ended session
// open to their batch (or open to everyone), tagged with the student's own
// attendance status. Mirrors '/faculty/history/sessions', but scoped to one
// student's status instead of a full roster — powers the student-facing
// "Class History" screen.
router.get('/student/history', authStudent, async (req, res) => {
  try {
    const studentBatch = await getStudentBatch(req.student.email, req.student.id);

    const sessions = await AttendanceSession.find({
      status: 'ended',
      $or: [
        { batches: { $size: 0 } },
        ...(studentBatch ? [{ batches: studentBatch }] : [])
      ]
    })
      .select('subject venue day slot batches startedAt endedAt')
      .populate('faculty', 'name department')
      .sort({ endedAt: -1 });

    const sessionIds = sessions.map((s) => s._id);
    const records = await AttendanceRecord.find({
      session: { $in: sessionIds },
      student: req.student.id
    });
    const recordBySessionId = {};
    records.forEach((r) => { recordBySessionId[r.session.toString()] = r; });

    const history = sessions.map((session) => {
      const record = recordBySessionId[session._id.toString()];
      const isPresent =
        record &&
        record.feedbackCompleted !== false &&
        (record.finalStatus === 'present' || (!record.finalStatus && record.status === 'present'));
      return {
        _id: session._id,
        subject: session.subject,
        venue: session.venue,
        day: session.day,
        slot: session.slot,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        faculty: session.faculty ? { name: session.faculty.name, department: session.faculty.department } : null,
        status: isPresent ? 'present' : 'absent'
      };
    });

    res.json({ count: history.length, sessions: history });
  } catch (error) {
    console.error('❌ Get student class-history error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Characters chosen to avoid visual ambiguity when read off a phone/projector
// and typed by hand: no 0/O, 1/I/L, no lowercase.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const generateSessionCode = () => {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return code;
};

// Only needs to be unique among sessions that are currently active — once a
// session ends its code is fair game for reuse. Collisions are already rare
// (32^6 ≈ 1 billion combinations) but this makes it safe regardless.
const generateUniqueSessionCode = async () => {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateSessionCode();
    const clash = await AttendanceSession.findOne({ attendanceCode: code, status: 'active' });
    if (!clash) return code;
  }
  throw new Error('Could not generate a unique attendance code — please try again.');
};

// ============ Rotating code / QR (no DB writes on rotation) ============
// The code + QR shown to the professor change every ROTATE_INTERVAL_MS, but
// this is PURE COMPUTATION — nothing is written to Mongo when it "rotates".
// A session gets one random codeSeed at creation time (stored once). The
// code for any point in time is HMAC(codeSeed + server secret, windowIndex),
// mapped onto CODE_CHARS. Given the same seed + window index, the server
// always derives the same code — so generating (for display) and validating
// (on /mark) are just the same function called at two different times, with
// zero extra reads/writes beyond the one-time seed lookup that already
// happens as part of fetching the session.
const ROTATE_INTERVAL_MS = 10000;

// Not meant to be secret-critical (this isn't protecting money), just
// enough that a student can't derive future/past codes without also
// knowing this. Set ATTENDANCE_CODE_SECRET in env for production.
const CODE_SECRET = process.env.ATTENDANCE_CODE_SECRET || 'dev-fallback-secret-change-me';

const windowIndexAt = (atTime = Date.now()) => Math.floor(atTime / ROTATE_INTERVAL_MS);

// Deterministically derive the code for a given seed + window index.
const codeForWindow = (codeSeed, windowIndex) => {
  const hmac = crypto
    .createHmac('sha256', `${codeSeed}:${CODE_SECRET}`)
    .update(String(windowIndex))
    .digest();
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[hmac[i] % CODE_CHARS.length];
  }
  return code;
};

// Current rotating code for a session, plus when it next changes. Falls
// back to the static attendanceCode for old sessions that predate codeSeed
// (created before this feature existed) so nothing breaks mid-flight.
const getCurrentRotatingCode = (session, atTime = Date.now()) => {
  if (!session.codeSeed) {
    return { code: session.attendanceCode, windowIndex: null };
  }
  const windowIndex = windowIndexAt(atTime);
  return { code: codeForWindow(session.codeSeed, windowIndex), windowIndex };
};

// Does `submittedCode` match this session's rotating code right now (or in
// the immediately adjacent windows, to tolerate scan/typing/network delay)?
// All comparisons use the SERVER's clock on both the generate side and the
// validate side, so the student's device clock is irrelevant.
const RESPONDS_TO_WINDOWS = [0, -1, 1]; // current, previous, next
const matchesRotatingCode = (session, submittedCode, atTime = Date.now()) => {
  if (!session.codeSeed) {
    // Legacy session without a seed — fall back to the static code.
    return session.attendanceCode === submittedCode;
  }
  const windowIndex = windowIndexAt(atTime);
  return RESPONDS_TO_WINDOWS.some(
    (offset) => codeForWindow(session.codeSeed, windowIndex + offset) === submittedCode
  );
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

// Weekly-schedule day names, used to compare a lecture's scheduled `day`
// against the server's current day-of-week. Kept in this exact casing
// ("Monday", not "monday") to match what the app sends/displays, though
// the comparison below is done case-insensitively anyway.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const getTodayDayName = () => DAY_NAMES[new Date().getDay()];

// ============ FACULTY: Start Attendance Session ============
router.post('/session/start', authFaculty, async (req, res) => {
  try {
    const { subject, venue, day, slot, professorLocation, professorAccuracy, radiusMeters, batches } = req.body;

    if (!subject || !professorLocation || professorLocation.lat == null || professorLocation.lng == null) {
      return res.status(400).json({ error: 'subject and professorLocation {lat, lng} are required' });
    }

    // ---- Recurring-class guardrails ----
    // A scheduled lecture (has both day + slot) is recurring weekly by
    // default, so it should only ever be startable (a) on its own scheduled
    // day of the week, and (b) once per calendar day. Both are enforced
    // here server-side — never trust the client's local clock/cache alone.
    if (day && slot) {
      const todayName = getTodayDayName();
      if (day.trim().toLowerCase() !== todayName.toLowerCase()) {
        return res.status(400).json({
          error: `This class is scheduled for ${day}. You can only start attendance on ${day}.`
        });
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      const existingToday = await AttendanceSession.findOne({
        faculty: req.faculty.id,
        day,
        slot,
        startedAt: { $gte: startOfDay, $lte: endOfDay }
      });

      if (existingToday) {
        return res.status(409).json({
          error: existingToday.status === 'active'
            ? 'Attendance is already running for this class today.'
            : 'Attendance for this class has already been taken today. It will open again on the next scheduled day.',
          session: existingToday
        });
      }
    }

    // ---- Feedback questions must already be set on this timetable slot ----
    // Feedback is now mandatory and happens right after a student scans/
    // enters the code (not after the professor ends the session), so the
    // 5 questions have to exist *before* attendance can start at all. They
    // live on the faculty's own timetable slot (Faculty.timetable.schedule
    // [day][slot].feedbackQuestions) — set/edited from ClassDetails or the
    // Bootcamp screen's "Feedback Questions" section — and get copied onto
    // this session so they're frozen for this particular run.
    let slotFeedbackQuestions = [];
    if (day && slot) {
      const facultyDoc = await Faculty.findById(req.faculty.id).select('timetable');
      slotFeedbackQuestions = facultyDoc?.timetable?.schedule?.[day]?.[slot]?.feedbackQuestions || [];
      if (!Array.isArray(slotFeedbackQuestions) || slotFeedbackQuestions.length !== 5) {
        return res.status(400).json({
          error: 'Add exactly 5 feedback questions for this class before starting attendance.'
        });
      }
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
      radiusMeters: radiusMeters || 30,
      attendanceCode: await generateUniqueSessionCode(),
      codeSeed: crypto.randomBytes(16).toString('hex'),
      feedbackQuestions: slotFeedbackQuestions,
      // Feedback opens immediately — students answer it right after their
      // scan/code step, there's no separate "start feedback" action anymore.
      feedbackStatus: slotFeedbackQuestions.length === 5 ? 'open' : 'not_set',
      feedbackStartedAt: slotFeedbackQuestions.length === 5 ? new Date() : null
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

// ============ FACULTY: Current Rotating Code + QR ============
// Polled every ROTATE_INTERVAL_MS by AttendanceSessionScreen. Pure
// computation — reads the session once, derives the code, no writes.
router.get('/session/:id/rotating-code', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id })
      .select('status codeSeed attendanceCode');
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'active') {
      return res.json({
        active: false,
        code: session.attendanceCode,
        qrValue: JSON.stringify({ s: session._id, c: session.attendanceCode }),
        rotateSeconds: ROTATE_INTERVAL_MS / 1000,
        expiresAt: null,
        serverTime: Date.now()
      });
    }

    const now = Date.now();
    const { code, windowIndex } = getCurrentRotatingCode(session, now);
    const expiresAt = windowIndex == null ? null : (windowIndex + 1) * ROTATE_INTERVAL_MS;

    res.json({
      active: true,
      code,
      // QR carries the sessionId alongside the code so a scan can look the
      // session up directly instead of searching every active session.
      qrValue: JSON.stringify({ s: session._id, c: code }),
      rotateSeconds: ROTATE_INTERVAL_MS / 1000,
      expiresAt,
      serverTime: now
    });
  } catch (error) {
    console.error('❌ Get rotating code error:', error);
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

    // ---- Auto-clear one-off schedule slots ----
    // A lecture in Faculty.timetable.schedule[day][slot] is "recurring"
    // (repeats weekly, unchanged) by default — those are left exactly as
    // they are, so normal weekly classes keep working like before.
    // Admin can instead mark a lecture `recurring: false` (a class whose
    // batch/time/venue is different every week). For those, the moment
    // attendance is ended the slot is wiped from the live schedule — the
    // full record of what actually happened stays forever in this
    // AttendanceSession + its AttendanceRecords, completely untouched.
    // This just clears the *upcoming* view so admin/faculty/students never
    // see stale batch/venue info, and admin never has to remember to
    // delete/edit it before next week — they simply add a fresh slot
    // whenever the next occurrence is scheduled.
    try {
      if (session.day && session.slot) {
        const faculty = await Faculty.findById(session.faculty);
        const lecture = faculty?.timetable?.schedule?.[session.day]?.[session.slot];
        if (lecture && lecture.recurring === false) {
          delete faculty.timetable.schedule[session.day][session.slot];
          if (Object.keys(faculty.timetable.schedule[session.day]).length === 0) {
            delete faculty.timetable.schedule[session.day];
          }
          faculty.markModified('timetable');
          await faculty.save();
          console.log(`🔄 One-off slot cleared after session end: ${session.day} · ${session.slot} (faculty ${faculty._id})`);
        }
      }
    } catch (clearErr) {
      // Never let schedule cleanup fail the actual "end attendance" action —
      // the session itself already ended successfully above.
      console.error('⚠️ Failed to auto-clear one-off schedule slot:', clearErr);
    }

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
      // Previous version only pulled BootcampStudent records whose batch
      // CURRENTLY matched sessionBatches, then overlaid those onto a
      // separate Student.batch-based match. That meant a student who used
      // to be in RedA (matching Student.batch, never updated after an
      // admin reassignment) but has since been moved to RedB in
      // BootcampStudent would still slip into the RedA roster — their
      // BootcampStudent record wouldn't show up in the $in query (since
      // its batch is now RedB, not RedA), so the stale Student.batch match
      // was never overwritten/removed.
      //
      // Fix: load every BootcampStudent record unconditionally (it's
      // authoritative whenever it exists), then filter by batch AFTER
      // resolving each student's true current batch — so a reassignment
      // always wins, in both directions.
      const [allBootcampEntries, allStudents] = await Promise.all([
        BootcampStudent.find({}).select('email batch'),
        Student.find({}).select('name rollNo branch batch email').sort({ name: 1 })
      ]);

      const bootcampByEmail = {};
      allBootcampEntries.forEach((b) => { bootcampByEmail[b.email] = b.batch; });

      students = allStudents
        .map((s) => ({
          _id: s._id,
          name: s.name,
          rollNo: s.rollNo,
          branch: s.branch,
          batch: Object.prototype.hasOwnProperty.call(bootcampByEmail, s.email)
            ? bootcampByEmail[s.email]
            : s.batch
        }))
        .filter((s) => sessionBatches.includes(s.batch));
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
        recordId: record ? record._id : null,
        pendingFeedback: !!(record && record.feedbackCompleted === false)
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
    // Safety net: a session left "active" forever (faculty forgot to end
    // it, or a test session from days ago) would otherwise show up as
    // "live" to every matching student indefinitely, with no way to clear
    // it except manually editing the database. No real class runs longer
    // than a few hours, so auto-close anything active past that — this
    // also retroactively fixes any already-stuck sessions the moment this
    // code runs, no manual DB cleanup needed.
    const MAX_SESSION_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
    await AttendanceSession.updateMany(
      { status: 'active', startedAt: { $lt: new Date(Date.now() - MAX_SESSION_AGE_MS) } },
      { status: 'ended', endedAt: new Date() }
    );

    const studentBatch = await getStudentBatch(req.student.email, req.student.id);

    const session = await AttendanceSession.findOne({ status: 'active' })
      .sort({ startedAt: -1 })
      .populate('faculty', 'name department');

    if (!session) {
      // No live attendance right now — check whether this student scanned
      // for a session (still active or since ended) but never finished the
      // mandatory feedback for it.
      const pendingRecord = await AttendanceRecord.findOne({
        student: req.student.id,
        status: { $in: ['present', 'flagged'] },
        feedbackCompleted: false
      }).sort({ scannedAt: -1 });

      const feedbackSession = pendingRecord
        ? await AttendanceSession.findById(pendingRecord.session).populate('faculty', 'name department')
        : null;

      if (!feedbackSession) {
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

    console.log(
      `📋 /active check — student email=${req.student.email}, studentBatch='${studentBatch}', ` +
      `session='${session.subject}', sessionBatches=${JSON.stringify(sessionBatches)}, ` +
      `isForThisStudent=${isForThisStudent}`
    );

    if (!isForThisStudent) {
      return res.json({ session: null, alreadyMarked: false, myStatus: null, type: 'attendance' });
    }

    const existingRecord = await AttendanceRecord.findOne({
      session: session._id,
      student: req.student.id
    });

    // Already scanned for this live session but hasn't finished the
    // mandatory feedback yet (e.g. they backgrounded the app mid-form) —
    // send them straight back to the feedback form instead of the scan
    // screen, since re-scanning would just fail on the duplicate-record check.
    if (existingRecord && existingRecord.feedbackCompleted === false) {
      return res.json({
        type: 'feedback',
        session: {
          _id: session._id,
          subject: session.subject,
          venue: session.venue,
          day: session.day,
          slot: session.slot,
          startedAt: session.startedAt,
          faculty: session.faculty ? { name: session.faculty.name, department: session.faculty.department } : null
        },
        alreadyMarked: false,
        myStatus: existingRecord.status
      });
    }

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

// ============ STUDENT: Enter Code & Mark Attendance ============
router.post('/mark', authStudent, async (req, res) => {
  try {
    const { code, sessionId, studentGPS, studentAccuracy, mocked } = req.body;

    if (!code || !studentGPS || studentGPS.lat == null || studentGPS.lng == null) {
      return res.status(400).json({ error: 'code and studentGPS {lat, lng} are required' });
    }

    const normalizedCode = String(code).trim().toUpperCase();

    // The app sets this when Android's location API itself flags the
    // reading as coming from a mock-location provider (fake GPS app). This
    // is the check that actually matters — the client-side check in
    // ScanAttendanceScreen is just a faster/friendlier version of this same
    // rejection; someone bypassing the app and calling this endpoint
    // directly would skip that one, but not this one.
    if (mocked === true) {
      return res.status(403).json({
        error: 'Mock/fake location detected. Please disable any mock location app or developer setting and try again.'
      });
    }

    // The code rotates every few seconds and is never stored per-window in
    // Mongo — it's re-derived here the same way it was derived for display
    // (see getCurrentRotatingCode / matchesRotatingCode above). Two paths:
    //  - QR scan: sessionId comes along with the code, so we can go
    //    straight to that session (fast path, one findOne).
    //  - Typed code: only the 6 chars are known, so we check it against
    //    every currently active session (there are only ever a handful of
    //    classes running at once) and take whichever one matches.
    let session;
    if (sessionId) {
      const candidate = await AttendanceSession.findOne({ _id: sessionId, status: 'active' });
      if (candidate && matchesRotatingCode(candidate, normalizedCode)) {
        session = candidate;
      }
    } else {
      const activeSessions = await AttendanceSession.find({ status: 'active' });
      session = activeSessions.find((s) => matchesRotatingCode(s, normalizedCode));
    }

    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired attendance code. Please check with your professor and try again.' });
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

    // Present/flagged scans are step 1 only — this student still owes the
    // mandatory feedback form before they're actually counted as marked
    // (see feedback.js /submit, which flips this to true). Rejected scans
    // have nothing to complete, so they default to true (not blocking).
    const needsFeedback = status === 'present' || status === 'flagged';
    const hasQuestions = Array.isArray(session.feedbackQuestions) && session.feedbackQuestions.length === 5;

    const record = new AttendanceRecord({
      session: session._id,
      student: req.student.id,
      studentLocation: { lat: studentGPS.lat, lng: studentGPS.lng },
      studentAccuracy: accuracy,
      distanceFromAnchor: Math.round(distance),
      status,
      feedbackCompleted: needsFeedback && hasQuestions ? false : true
    });

    await record.save();

    console.log(`✅ Attendance step 1 done: student ${req.student.id} -> ${status} (${Math.round(distance)}m)`);

    const requiresFeedback = needsFeedback && hasQuestions;

    res.status(201).json({
      message: requiresFeedback
        ? 'Almost done — please fill in the feedback form to complete your attendance.'
        : status === 'present'
        ? 'Marked present!'
        : status === 'flagged'
        ? 'Marked present — pending professor review'
        : "Couldn't verify your location. Please ask your professor to mark you manually.",
      status,
      distanceFromAnchor: Math.round(distance),
      requiresFeedback,
      sessionId: session._id
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