const express = require('express');
const router = express.Router();
const FeedbackQuestion = require('../models/FeedbackQuestion');
const FeedbackResponse = require('../models/FeedbackResponse');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const { authAdmin, authFaculty, authStudent } = require('../middleware/auth');

const QUESTION_TYPES = [
  'short_answer',
  'paragraph',
  'multiple_choice',
  'checkboxes',
  'dropdown',
  'linear_scale',
  'numerical'
];
const CHOICE_TYPES = ['multiple_choice', 'checkboxes', 'dropdown'];

// Validates an array of 5 question definitions coming from the admin or
// faculty question builder. Each item: { text, type, options?, scaleMin?, scaleMax? }
// Returns an error string, or null if valid.
function validateQuestionDefs(defs) {
  if (!Array.isArray(defs) || defs.length !== 5) {
    return 'Exactly 5 questions are required.';
  }
  for (const q of defs) {
    if (!q || !q.text || !q.text.trim()) {
      return 'Every question needs text.';
    }
    if (!QUESTION_TYPES.includes(q.type)) {
      return `Invalid question type: ${q.type}`;
    }
    if (CHOICE_TYPES.includes(q.type)) {
      const opts = (q.options || []).map((o) => (o || '').trim()).filter(Boolean);
      if (opts.length < 2) {
        return `"${q.text}" needs at least 2 options.`;
      }
    }
    if (q.type === 'linear_scale') {
      const min = q.scaleMin ?? 1;
      const max = q.scaleMax ?? 5;
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max) {
        return `"${q.text}" has an invalid scale range.`;
      }
    }
  }
  return null;
}

// Builds a clean, storage-ready question def from raw input.
function cleanQuestionDef(q, order) {
  const type = q.type;
  const base = { text: q.text.trim(), order, type };
  if (CHOICE_TYPES.includes(type)) {
    base.options = (q.options || []).map((o) => (o || '').trim()).filter(Boolean);
  } else {
    base.options = [];
  }
  if (type === 'linear_scale') {
    base.scaleMin = q.scaleMin ?? 1;
    base.scaleMax = q.scaleMax ?? 5;
  } else {
    base.scaleMin = 1;
    base.scaleMax = 5;
  }
  return base;
}

// Validates one submitted answer against its question definition. Returns
// an error string, or null if valid. Mutates nothing — caller builds the
// stored answer separately via buildStoredAnswer.
function validateAnswerAgainstDef(a, def) {
  if (!def) return 'One or more questions could not be matched. Please refresh and try again.';

  if (def.type === 'short_answer' || def.type === 'paragraph') {
    if (typeof a.textValue !== 'string' || !a.textValue.trim()) {
      return `"${def.text}" needs an answer.`;
    }
  } else if (def.type === 'numerical') {
    if (typeof a.numberValue !== 'number' || !Number.isFinite(a.numberValue)) {
      return `"${def.text}" needs a numeric answer.`;
    }
  } else if (def.type === 'linear_scale') {
    const min = def.scaleMin ?? 1;
    const max = def.scaleMax ?? 5;
    if (!Number.isInteger(a.numberValue) || a.numberValue < min || a.numberValue > max) {
      return `"${def.text}" needs a value between ${min} and ${max}.`;
    }
  } else if (def.type === 'multiple_choice' || def.type === 'dropdown') {
    if (!Array.isArray(a.selectedOptions) || a.selectedOptions.length !== 1 || !def.options.includes(a.selectedOptions[0])) {
      return `"${def.text}" needs one selected option.`;
    }
  } else if (def.type === 'checkboxes') {
    if (!Array.isArray(a.selectedOptions) || a.selectedOptions.length < 1 || a.selectedOptions.some((o) => !def.options.includes(o))) {
      return `"${def.text}" needs at least one selected option.`;
    }
  }
  return null;
}

function buildStoredAnswer(a, def, source) {
  const stored = {
    source,
    order: def.order,
    questionText: def.text,
    questionType: def.type
  };
  if (def.type === 'short_answer' || def.type === 'paragraph') {
    stored.textValue = a.textValue.trim();
  } else if (def.type === 'numerical' || def.type === 'linear_scale') {
    stored.numberValue = a.numberValue;
  } else {
    stored.selectedOptions = a.selectedOptions;
  }
  return stored;
}

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

// Replace all 5 fixed questions in one go.
// Body: { questions: [{ text, type, options?, scaleMin?, scaleMax? }, ...5] }
router.put('/admin/questions', authAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    const err = validateQuestionDefs(questions);
    if (err) return res.status(400).json({ error: err });

    const ops = questions.map((q, i) => {
      const def = cleanQuestionDef(q, i + 1);
      return {
        updateOne: {
          filter: { order: def.order },
          update: { $set: def },
          upsert: true
        }
      };
    });
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
// Body: { questions: [{ text, type, options?, scaleMin?, scaleMax? }, ...5] }
router.post('/session/:id/questions', authFaculty, async (req, res) => {
  try {
    const { questions } = req.body;
    const err = validateQuestionDefs(questions);
    if (err) return res.status(400).json({ error: err });

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

    session.feedbackQuestions = questions.map((q, i) => cleanQuestionDef(q, i + 1));
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
        ...adminQuestions.map((q) => ({
          source: 'admin', order: q.order, text: q.text, type: q.type,
          options: q.options, scaleMin: q.scaleMin, scaleMax: q.scaleMax
        })),
        ...session.feedbackQuestions
          .sort((a, b) => a.order - b.order)
          .map((q) => ({
            source: 'faculty', order: q.order, text: q.text, type: q.type,
            options: q.options, scaleMin: q.scaleMin, scaleMax: q.scaleMax
          }))
      ]
    });
  } catch (error) {
    console.error('❌ Get feedback form error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Submit the 10 answers.
// Body: { answers: [{ source, order, textValue?, numberValue?, selectedOptions? }] }
router.post('/session/:id/submit', authStudent, async (req, res) => {
  try {
    const { answers } = req.body;

    if (!Array.isArray(answers) || answers.length !== 10) {
      return res.status(400).json({ error: 'All 10 questions must be answered.' });
    }
    for (const a of answers) {
      if (!['admin', 'faculty'].includes(a.source) || !a.order) {
        return res.status(400).json({ error: 'Each answer needs a source and order.' });
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

    // Re-fetch the actual question defs server-side, so answers can't be
    // spoofed and stay correct even if questions are edited later.
    const adminQuestions = await FeedbackQuestion.find({}).sort({ order: 1 });
    const adminByOrder = {};
    adminQuestions.forEach((q) => { adminByOrder[q.order] = q; });
    const facultyByOrder = {};
    session.feedbackQuestions.forEach((q) => { facultyByOrder[q.order] = q; });

    for (const a of answers) {
      const def = a.source === 'admin' ? adminByOrder[a.order] : facultyByOrder[a.order];
      const err = validateAnswerAgainstDef(a, def);
      if (err) return res.status(400).json({ error: err });
    }

    const builtAnswers = answers.map((a) => {
      const def = a.source === 'admin' ? adminByOrder[a.order] : facultyByOrder[a.order];
      return buildStoredAnswer(a, def, a.source);
    });

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