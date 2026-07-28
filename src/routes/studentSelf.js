const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { authStudent } = require('../middleware/auth');

// ============ STUDENT: Reset/change my own password ============
// The app's "update password" screen calls POST /api/student/reset-password
// while the student is already logged in (this is a "change password"
// flow, not an unauthenticated "I forgot my password" email/OTP flow —
// there's no email-sending infra in this backend for that yet).
//
// Requires the current password so a stolen/borrowed session token can't
// silently lock the real owner out of their account.
router.post('/reset-password', authStudent, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const student = await Student.findById(req.student.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const isMatch = await student.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    student.password = newPassword; // Student's pre('save') hook hashes this with bcrypt
    student.updatedAt = new Date();
    await student.save();

    console.log(`✅ Password reset for: ${student.name}`);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;
