const express = require('express');
const router = express.Router();
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const { authFaculty, authStudent } = require('../middleware/auth');

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
    const { subject, venue, day, slot, professorLocation, professorAccuracy, radiusMeters } = req.body;

    if (!subject || !professorLocation || professorLocation.lat == null || professorLocation.lng == null) {
      return res.status(400).json({ error: 'subject and professorLocation {lat, lng} are required' });
    }

    const session = new AttendanceSession({
      faculty: req.faculty.id,
      subject: subject.trim(),
      venue: venue || '',
      day: day || '',
      slot: slot || '',
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
    const session = await AttendanceSession.findOne({ status: 'active' })
      .sort({ startedAt: -1 })
      .populate('faculty', 'name department');

    if (!session) {
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
