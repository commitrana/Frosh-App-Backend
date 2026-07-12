const express = require('express');
const router = express.Router();
const FeedbackQuestion = require('../models/FeedbackQuestion');
const FeedbackResponse = require('../models/FeedbackResponse');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const { authAdmin, authFaculty, authStudent } = require('../middleware/auth');

// ============================================================
// ADMIN: the 5 fixed global questions
// ============================================================

// GET the 5 fixed questions (may be fewer than 5 if never configured yet).
router.get('/admin/questions', authAdmin, async (req, res) => {
  try {
    const questions = await FeedbackQuestion.find({}).sort({ order: 1 });
    res.json({ questions });
  } catch (error) {
    console.error('❌ Get admin feedback questions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Replace all 5 fixed questions in one go. Body: { questions: ["...", "...", ...] }
// exactly 5 non-empty strings, in display order.
router.put('/admin/questions', authAdmin, async (req, res) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length !== 5 || questions.some((q) => !q || !q.trim())) {
      return res.status(400).json({ error: 'Exactly 5 non-empty questions are required.' });
    }

    const ops = questions.map((text, i) => ({
      updateOne: {
        filter: { order: i + 1 },
        update: { $set: { text: text.trim(), order: i + 1 } },
        upsert: true
      }
    }));
    await FeedbackQuestion.bulkWrite(ops);

    const saved = await FeedbackQuestion.find({}).sort({ order: 1 });
    console.log('✅ Admin feedback questions updated');
    res.json({ message: 'Feedback questions saved', questions: saved });
  } catch (error) {
    console.error('❌ Update admin feedback questions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// List sessions where feedback has been started (for the admin's "View Feedback" list).
router.get('/admin/sessions', authAdmin, async (req, res) => {
  try {
    const sessions = await AttendanceSession.find({ feedbackStatus: { $ne: 'not_set' } })
      .sort({ feedbackStartedAt: -1 })
      .populate('faculty', 'name department');
    res.json({ count: sessions.length, sessions });
  } catch (error) {
    console.error('❌ Admin list feedback sessions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// All 10 questions' responses for a given session.
router.get('/admin/session/:id/responses', authAdmin, async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.id).populate('faculty', 'name department');
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const responses = await FeedbackResponse.find({ session: session._id })
      .populate('student', 'name rollNo branch')
      .sort({ submittedAt: 1 });

    res.json({ session, count: responses.length, responses });
  } catch (error) {
    console.error('❌ Admin get session feedback responses error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================================================
// FACULTY: add exactly 5 session questions, start feedback, view own responses
// ============================================================

// Faculty adds exactly 5 questions for a session they just ended.
// Body: { questions: ["...", "...", ...] } exactly 5 non-empty strings.
router.post('/session/:id/questions', authFaculty, async (req, res) => {
  try {
    const { questions } = req.body;

    if (!Array.isArray(questions) || questions.length !== 5 || questions.some((q) => !q || !q.trim())) {
      return res.status(400).json({ error: 'Exactly 5 non-empty questions are required.' });
    }

    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'ended') {
      return res.status(400).json({ error: 'End the attendance session before adding feedback questions.' });
    }

    if (session.feedbackStatus !== 'not_set') {
      return res.status(400).json({ error: 'Feedback questions for this session are already set.' });
    }

    session.feedbackQuestions = questions.map((text, i) => ({ text: text.trim(), order: i + 1 }));
    await session.save();

    console.log(`✅ Faculty feedback questions set for session ${session._id}`);
    res.json({ message: 'Feedback questions saved', session });
  } catch (error) {
    console.error('❌ Set session feedback questions error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Faculty opens feedback collection for this session (students now see
// "Give Feedback" instead of "Mark Attendance").
router.post('/session/:id/start', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.feedbackQuestions.length !== 5) {
      return res.status(400).json({ error: 'Add exactly 5 feedback questions before starting feedback.' });
    }

    if (session.feedbackStatus === 'open') {
      return res.json({ message: 'Feedback already started', session });
    }

    session.feedbackStatus = 'open';
    session.feedbackStartedAt = new Date();
    await session.save();

    console.log(`✅ Feedback started for session ${session._id}`);
    res.json({ message: 'Feedback started', session });
  } catch (error) {
    console.error('❌ Start session feedback error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Faculty views responses to their own 5 questions only.
router.get('/session/:id/responses', authFaculty, async (req, res) => {
  try {
    const session = await AttendanceSession.findOne({ _id: req.params.id, faculty: req.faculty.id });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const responses = await FeedbackResponse.find({ session: session._id })
      .populate('student', 'name rollNo branch')
      .sort({ submittedAt: 1 });

    // Strip out the admin questions — faculty only sees their own 5.
    const trimmed = responses.map((r) => ({
      _id: r._id,
      student: r.student,
      submittedAt: r.submittedAt,
      answers: r.answers.filter((a) => a.source === 'faculty').sort((a, b) => a.order - b.order)
    }));

    res.json({
      subject: session.subject,
      questions: session.feedbackQuestions.sort((a, b) => a.order - b.order),
      count: trimmed.length,
      responses: trimmed
    });
  } catch (error) {
    console.error('❌ Faculty get session feedback responses error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============================================================
// STUDENT: fetch the 10-question form, submit answers
// ============================================================

// Returns the combined 10 questions for a session, or an error if this
// student isn't eligible (wasn't present/flagged, feedback not open, or
// already submitted).
router.get('/session/:id/form', authStudent, async (req, res) => {
  try {
    const session = await AttendanceSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.feedbackStatus !== 'open') {
      return res.status(400).json({ error: 'Feedback is not open for this session.' });
    }

    const record = await AttendanceRecord.findOne({ session: session._id, student: req.student.id });
    const eligible = !!record && ['present', 'flagged'].includes(record.status);
    if (!eligible) {
      return res.status(403).json({ error: 'Only students marked present for this session can give feedback.' });
    }

    const existing = await FeedbackResponse.findOne({ session: session._id, student: req.student.id });
    if (existing) {
      return res.status(400).json({ error: 'You have already submitted feedback for this session.' });
    }

    const adminQuestions = await FeedbackQuestion.find({}).sort({ order: 1 });

    res.json({
      session: { _id: session._id, subject: session.subject, venue: session.venue },
      questions: [
        ...adminQuestions.map((q) => ({ source: 'admin', order: q.order, text: q.text })),
        ...session.feedbackQuestions
          .sort((a, b) => a.order - b.order)
          .map((q) => ({ source: 'faculty', order: q.order, text: q.text }))
      ]
    });
  } catch (error) {
    console.error('❌ Get feedback form error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Submit the 10 answers. Body: { answers: [{ source, order, rating, comment }] }
router.post('/session/:id/submit', authStudent, async (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length !== 10) {
      return res.status(400).json({ error: 'All 10 questions must be answered.' });
    }
    for (const a of answers) {
      if (!['admin', 'faculty'].includes(a.source) || !a.order || a.rating == null) {
        return res.status(400).json({ error: 'Each answer needs a source, order, and rating.' });
      }
      if (!Number.isInteger(a.rating) || a.rating < 1 || a.rating > 5) {
        return res.status(400).json({ error: 'Ratings must be whole numbers from 1 to 5.' });
      }
    }

    const session = await AttendanceSession.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.feedbackStatus !== 'open') {
      return res.status(400).json({ error: 'Feedback is not open for this session.' });
    }

    const record = await AttendanceRecord.findOne({ session: session._id, student: req.student.id });
    const eligible = !!record && ['present', 'flagged'].includes(record.status);
    if (!eligible) {
      return res.status(403).json({ error: 'Only students marked present for this session can give feedback.' });
    }

    // Re-attach the actual question text server-side, so it can't be spoofed
    // and stays correct even if questions are edited later.
    const adminQuestions = await FeedbackQuestion.find({}).sort({ order: 1 });
    const adminByOrder = {};
    adminQuestions.forEach((q) => { adminByOrder[q.order] = q.text; });
    const facultyByOrder = {};
    session.feedbackQuestions.forEach((q) => { facultyByOrder[q.order] = q.text; });

    const builtAnswers = answers.map((a) => {
      const questionText = a.source === 'admin' ? adminByOrder[a.order] : facultyByOrder[a.order];
      return {
        source: a.source,
        order: a.order,
        questionText: questionText || '',
        rating: a.rating,
        comment: (a.comment || '').trim()
      };
    });

    if (builtAnswers.some((a) => !a.questionText)) {
      return res.status(400).json({ error: 'One or more questions could not be matched. Please refresh and try again.' });
    }

    const response = new FeedbackResponse({
      session: session._id,
      student: req.student.id,
      answers: builtAnswers
    });
    await response.save();

    console.log(`✅ Feedback submitted: student ${req.student.id} -> session ${session._id}`);
    res.status(201).json({ message: 'Feedback submitted. Thank you!', response });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'You have already submitted feedback for this session.' });
    }
    console.error('❌ Submit feedback error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
