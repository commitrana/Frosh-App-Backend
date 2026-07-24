const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord = require('../models/AttendanceRecord');
const FeedbackQuestion = require('../models/FeedbackQuestion');
const FeedbackResponse = require('../models/FeedbackResponse');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const Faculty = require('../models/Faculty');

// ============ Shared "Clear History" core ============
// Deletes every piece of runtime/history data that BOTH "Clear History"
// and "Reset" have in common: attendance sessions/records, feedback
// questions/responses, and event tickets (registrations).
//
// Deliberately does NOT touch Event documents here — the two callers
// disagree on what to do with events (Clear History keeps them and just
// zeroes their ticket counter, Reset deletes them outright), so that
// decision is left to each route. Student/Faculty/Society/Admin accounts
// are never touched by this function.
async function clearRuntimeHistory() {
  const [
    sessionsResult,
    recordsResult,
    questionsResult,
    responsesResult,
    ticketsResult
  ] = await Promise.all([
    AttendanceSession.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    FeedbackQuestion.deleteMany({}),
    FeedbackResponse.deleteMany({}),
    Ticket.deleteMany({})
  ]);

  return {
    attendanceSessions: sessionsResult.deletedCount,
    attendanceRecords: recordsResult.deletedCount,
    feedbackQuestions: questionsResult.deletedCount,
    feedbackResponses: responsesResult.deletedCount,
    tickets: ticketsResult.deletedCount
  };
}

// ============ Clear History (public API) ============
// Runs the shared cleanup above, then resets each event's ticketsIssued
// counter back to 0 — the Event documents themselves are left in place.
async function clearHistory() {
  const [deleted, eventsResetResult] = await Promise.all([
    clearRuntimeHistory(),
    Event.updateMany({}, { $set: { ticketsIssued: 0 } })
  ]);

  return {
    deleted,
    eventsReset: eventsResetResult.modifiedCount
  };
}

// ============ Full Reset (public API) ============
// Everything Clear History deletes, PLUS:
//   - Event documents deleted outright (their tickets are already gone
//     via clearRuntimeHistory, so there's nothing left referencing them).
//   - Every faculty's timetable wiped back to its brand-new-account
//     default ({ schedule: [] }) — this is what "classes created by
//     faculty" actually live in (see routes/bootcamp.js
//     buildTimetableForBatch, and routes/faculty.js create route).
// Student / Faculty / Society / Admin accounts and their login
// credentials are never touched.
async function resetApplication() {
  const deleted = await clearRuntimeHistory();

  const [eventsResult, facultyResetResult] = await Promise.all([
    Event.deleteMany({}),
    Faculty.updateMany({}, { $set: { timetable: { schedule: [] } } })
  ]);

  return {
    deleted: {
      ...deleted,
      events: eventsResult.deletedCount
    },
    classesReset: facultyResetResult.modifiedCount
  };
}

module.exports = {
  clearRuntimeHistory,
  clearHistory,
  resetApplication
};
