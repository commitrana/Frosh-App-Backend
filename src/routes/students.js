const express = require('express');
const router = express.Router();
const multer = require('multer');
const Student = require('../models/Student');
const BootcampStudent = require('../models/BootcampStudent');
const { authAdmin, authStudent } = require('../middleware/auth');
const { uploadToImageHost, deleteFromImageHost } = require('../utils/supabaseUpload');

// The CSV import/export format uses DD-MM-YYYY (e.g. "28-09-2003"), which
// JavaScript's native `new Date(string)` does NOT parse correctly:
//   - day > 12  -> "Invalid Date" (fails validation, row rejected)
//   - day <= 12 -> silently misread as MM-DD-YYYY, swapping day and month
//                  (e.g. "07-05-2007" becomes 5 July instead of 7 May) with
//                  NO error at all — a wrong birthdate saved as if correct.
// This parses that exact format explicitly so both cases are handled right.
function parseDDMMYYYY(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // Guard against e.g. "31-02-2003" (Feb 31st) rolling over into March
  if (date.getUTCMonth() !== Number(month) - 1) return null;
  return date;
}

// Same multer setup already used for team photo uploads (routes/team.js) —
// memory storage so we can hand the raw buffer straight to Supabase, with a
// generous raw-upload cap since the app compresses/resizes the image on the
// device before it ever reaches this route.
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB raw upload cap, pre-compression
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

// Fetch the student's batch — checks BootcampStudent first (the authoritative
// source for batch assignments), falls back to Student.batch if not found there.
const getStudentBatch = async (email, studentId) => {
  const bootcampEntry = await BootcampStudent.findOne({ email }).select('batch');
  if (bootcampEntry) return bootcampEntry.batch;
  const studentEntry = await Student.findById(studentId).select('batch');
  return studentEntry?.batch ?? null;
};

// ============ STUDENT: Get my own profile (used by the app's Profile tab) ============
router.get('/students/me', authStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.student.id).select('-password');
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const batch = await getStudentBatch(student.email, student._id);

    res.json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        branch: student.branch,
        phoneNo: student.phoneNo,
        dob: student.dob,
        fatherName: student.fatherName,
        motherName: student.motherName,
        rollNo: student.rollNo,
        slotNumber: student.slotNumber,
        batch,
        profileImage: student.profileImage || null
      }
    });
  } catch (error) {
    console.error('❌ Get my profile error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Upload/replace my profile photo ============
// multipart/form-data, field name "photo". The app resizes + compresses the
// image client-side before sending it here, so this route just forwards
// the buffer straight to Supabase Storage — same pattern as
// POST /admin/team/upload in routes/team.js.
router.post('/students/me/photo', authStudent, photoUpload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const student = await Student.findById(req.student.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const { url, path } = await uploadToImageHost(req.file.buffer, 'students');
    const oldPath = student.profileImagePath;

    student.profileImage = url;
    student.profileImagePath = path;
    student.updatedAt = new Date();
    await student.save();

    console.log(`✅ Profile photo updated for: ${student.name}`);

    res.json({
      message: 'Profile photo updated successfully!',
      profileImage: url
    });

    // Clean up the previous photo from the bucket after responding, so a
    // failure here never blocks or slows down the student's request.
    if (oldPath) {
      deleteFromImageHost(oldPath).catch((err) =>
        console.error('⚠️ Failed to delete old profile photo:', err.message)
      );
    }
  } catch (error) {
    console.error('❌ Upload profile photo error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ HELPER FUNCTION: Generate Password from Father's Name + Mobile ============
// New rule: father's FIRST NAME (first word of fatherName, as typed) +
// first 4 digits of the mobile number.
// e.g. fatherName = "Ramesh Kumar", phoneNo = "9876543210"
//      -> password = "Ramesh9876"
const generatePasswordFromFatherAndMobile = (student) => {
  // First word of father's name, trimmed of extra spaces. Keep original
  // casing as typed (don't force-case it) so admins recognise it as-is.
  const fatherName = (student.fatherName || '').trim();
  const fatherFirstName = fatherName.split(/\s+/)[0] || '';

  // Strip anything that isn't a digit (handles "+91 98765-43210", spaces,
  // dashes, etc.) then take the first 4 digits.
  const phoneDigits = (student.phoneNo || '').replace(/\D/g, '');
  const first4Digits = phoneDigits.slice(0, 4);

  // Fallback: if either piece is missing, we can't build the intended
  // password, so generate a random one instead of silently producing a
  // weak/incomplete password like "9876" or "Ramesh".
  if (!fatherFirstName || first4Digits.length < 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let random = '';
    for (let i = 0; i < 10; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `STU${random}`;
  }

  return `${fatherFirstName}${first4Digits}`;
};

// ============ GET ALL STUDENTS (with pagination) ============
router.get('/students', authAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder === 'desc' ? -1 : 1;

    const searchQuery = search ? {
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { branch: { $regex: search, $options: 'i' } },
        { rollNo: { $regex: search, $options: 'i' } },
        { fatherName: { $regex: search, $options: 'i' } },
        { motherName: { $regex: search, $options: 'i' } }
      ]
    } : {};

    const skip = (page - 1) * limit;

    const [students, total] = await Promise.all([
      Student.find(searchQuery)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      Student.countDocuments(searchQuery)
    ]);

    res.json({
      students,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit
    });
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ============ GET ALL STUDENTS (no pagination) ============
router.get('/students/all', authAdmin, async (req, res) => {
  try {
    const students = await Student.find({}).sort({ name: 1 });
    res.json({ students });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// ============ BULK UPDATE STUDENTS ============
// NOTE: this must be defined BEFORE the /students/:id route below, same
// reason as the bulk-delete route — otherwise PUT /students/bulk matches
// /:id with id="bulk" and this handler never runs.
router.put('/students/bulk', authAdmin, async (req, res) => {
  try {
    const { studentIds, ...updates } = req.body;
    updates.updatedAt = new Date();

    const result = await Student.updateMany(
      { _id: { $in: studentIds } },
      updates
    );

    res.json({ 
      message: `Updated ${result.modifiedCount} students`,
      modifiedCount: result.modifiedCount 
    });
  } catch (error) {
    console.error('Error bulk updating students:', error);
    res.status(500).json({ error: 'Failed to update students' });
  }
});

// ============ UPDATE STUDENT ============
router.put('/students/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    updates.updatedAt = new Date();

    const student = await Student.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ student });
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ error: 'Failed to update student' });
  }
});

// ============ BULK DELETE STUDENTS ============
// NOTE: this must be defined BEFORE the /students/:id route below.
// Express matches routes in the order they're registered — if /:id came
// first, a request to DELETE /students/bulk would incorrectly match
// /:id with id="bulk", never reaching this handler at all.
router.delete('/students/bulk', authAdmin, async (req, res) => {
  try {
    const { studentIds } = req.body;
    const result = await Student.deleteMany({ _id: { $in: studentIds } });

    res.json({ 
      message: `Deleted ${result.deletedCount} students`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    console.error('Error bulk deleting students:', error);
    res.status(500).json({ error: 'Failed to delete students' });
  }
});

// ============ DELETE STUDENT ============
router.delete('/students/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const student = await Student.findByIdAndDelete(id);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// ============ EXPORT STUDENTS TO CSV ============
router.get('/students/export', authAdmin, async (req, res) => {
  try {
    const students = await Student.find({}).sort({ name: 1 });
    
    const headers = ['name', 'email', 'password', 'branch', 'phoneNo', 'dob', 'fatherName', 'motherName', 'rollNo', 'slotNumber'];
    let csvContent = headers.join(',') + '\n';
    
    students.forEach(student => {
      const row = headers.map(header => {
        let value = student[header] || '';
        if (header === 'dob') {
          // Match the DD-MM-YYYY format the import route expects, so this
          // file can be re-imported later without hitting the same parsing bug.
          const d = new Date(value);
          const dd = String(d.getUTCDate()).padStart(2, '0');
          const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
          const yyyy = d.getUTCFullYear();
          value = `${dd}-${mm}-${yyyy}`;
        }
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=students_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting students:', error);
    res.status(500).json({ error: 'Failed to export students' });
  }
});

// ============ IMPORT STUDENTS FROM CSV ============
router.post('/students/import', authAdmin, async (req, res) => {
  try {
    const { students } = req.body;
    
    if (!students || !Array.isArray(students)) {
      return res.status(400).json({ error: 'Invalid students data' });
    }

    let imported = 0;
    let skipped = 0;
    let errors = [];

    for (const studentData of students) {
      try {
        // The frontend CSV parser lowercases every header, so build a
        // case-insensitive lookup instead of relying on exact keys.
        const normalized = {};
        Object.keys(studentData).forEach(key => {
          normalized[key.toLowerCase()] = studentData[key];
        });

        // Current sheet uses NAME / FNAME / APPNO / EMAIL / MOBILE.
        // Still accept the old header names too (rollno/fathername/phoneno)
        // so old-format CSVs keep working. First non-empty match wins.
        const pick = (...keys) => {
          for (const k of keys) {
            if (normalized[k] !== undefined && normalized[k] !== null && String(normalized[k]).trim() !== '') {
              return String(normalized[k]).trim();
            }
          }
          return '';
        };

        const name = pick('name');
        const email = pick('email').toLowerCase();
        const rollNo = pick('appno', 'rollno');
        const phoneNo = pick('mobile', 'phoneno');
        const fatherName = pick('fname', 'fathername');

        // Optional fields — no longer part of the sheet. Left blank
        // instead of erroring when absent.
        const branch = pick('branch');
        const motherName = pick('mothername');
        const rawSlotNumber = pick('slotnumber');
        const rawDob = pick('dob');

        // Skip rows that already exist (safe to re-run the same sheet any
        // number of times — already-imported students are just skipped,
        // not reported as failures).
        const existing = await Student.findOne({
          $or: [
            ...(email ? [{ email }] : []),
            ...(rollNo ? [{ rollNo }] : [])
          ]
        });
        if (existing) {
          skipped++;
          continue;
        }

        // Required fields for a row to be importable at all.
        if (!name || !email || !rollNo || !phoneNo || !fatherName) {
          throw new Error('Missing required field (need NAME, EMAIL, APPNO, MOBILE, FNAME)');
        }

        // dob is optional now — only parse it if present; an invalid/blank
        // value is just left as null instead of rejecting the whole row.
        const parsedDob = rawDob ? parseDDMMYYYY(rawDob) : null;

        const student = new Student({
          name,
          email,
          password: normalized.password?.trim() || '',
          branch,
          phoneNo,
          dob: parsedDob,
          fatherName,
          motherName,
          rollNo,
          slotNumber: rawSlotNumber ? (parseInt(rawSlotNumber) || null) : null
        });

        await student.save();
        imported++;
      } catch (error) {
        if (error.code === 11000) {
          skipped++;
        } else {
          errors.push(`Error (${studentData.email || studentData.rollNo || studentData.APPNO || 'unknown row'}): ${error.message}`);
        }
      }
    }

    res.json({
      message: `Imported ${imported} students (${skipped} already existed, skipped)`,
      imported,
      skipped,
      errors: errors.length,
      errorDetails: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('Error importing students:', error);
    res.status(500).json({ error: 'Failed to import students' });
  }
});

// ============ GENERATE PASSWORD FOR SINGLE STUDENT ============
router.post('/students/generate-password/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔑 Generating password for student ID: ${id}`);
    
    const student = await Student.findById(id);
    if (!student) {
      console.log(`❌ Student not found with ID: ${id}`);
      return res.status(404).json({ error: 'Student not found' });
    }
    
    console.log(`✅ Student found: ${student.name} (${student.email})`);
    
    const newPassword = generatePasswordFromFatherAndMobile(student);
    student.password = newPassword;
    student.updatedAt = new Date();
    await student.save();
    
    console.log(`✅ Password generated for: ${student.name}`);
    console.log(`🔑 New Password: ${newPassword}`);
    
    res.json({ 
      success: true,
      message: 'Password generated successfully!',
      password: newPassword,
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        fatherName: student.fatherName,
        phoneNo: student.phoneNo
      }
    });
  } catch (error) {
    console.error('❌ Error generating password:', error);
    res.status(500).json({ 
      error: 'Failed to generate password: ' + error.message 
    });
  }
});

// ============ GENERATE PASSWORDS FOR ALL STUDENTS (Only if not set) ============
router.post('/students/generate-all-passwords', authAdmin, async (req, res) => {
  try {
    console.log('🔑 Generating passwords for students without passwords...');
    
    // Get all students
    const students = await Student.find({});
    
    if (students.length === 0) {
      return res.status(404).json({ error: 'No students found' });
    }
    
    let generatedCount = 0;
    let alreadyHavePassword = 0;
    let errors = [];
    
    for (const student of students) {
      try {
        // ✅ Check if student already has a password
        if (student.password && student.password.length > 0) {
          alreadyHavePassword++;
          continue; // Skip this student, don't change password
        }
        
        // Generate password only for students without password
        const newPassword = generatePasswordFromFatherAndMobile(student);
        student.password = newPassword;
        student.updatedAt = new Date();
        await student.save();
        generatedCount++;
      } catch (error) {
        errors.push({
          student: student.name,
          email: student.email,
          error: error.message
        });
      }
    }
    
    console.log(`✅ Generated passwords for ${generatedCount} students`);
    console.log(`ℹ️ ${alreadyHavePassword} students already had passwords`);
    
    res.json({
      success: true,
      message: `Generated passwords for ${generatedCount} students (${alreadyHavePassword} already had passwords)`,
      totalStudents: students.length,
      generatedCount,
      alreadyHavePassword,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('❌ Error generating all passwords:', error);
    res.status(500).json({ 
      error: 'Failed to generate passwords: ' + error.message 
    });
  }
});
// ============ CREATE SINGLE STUDENT ============
router.post('/students/create', authAdmin, async (req, res) => {
  try {
    const { name, email, branch, phoneNo, dob, fatherName, motherName, rollNo, slotNumber } = req.body;
    
    // Validate required fields — matches the current sheet columns
    // (NAME, FNAME, APPNO, EMAIL, MOBILE). branch, dob, motherName and
    // slotNumber are no longer part of the source data, so they're
    // optional now and simply left blank if not sent.
    if (!name || !email || !phoneNo || !fatherName || !rollNo) {
      return res.status(400).json({ 
        error: 'Required fields: name, email, phoneNo, fatherName, rollNo' 
      });
    }
    
    // Check if student already exists
    const existingStudent = await Student.findOne({ 
      $or: [{ email }, { rollNo }] 
    });
    
    if (existingStudent) {
      return res.status(400).json({ 
        error: 'Student with this email or roll number already exists' 
      });
    }
    
    // Create new student — optional fields fall back to blank instead of
    // throwing, so a missing branch/dob/motherName/slotNumber never errors.
    const student = new Student({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      branch: branch ? branch.trim() : '',
      phoneNo: phoneNo.trim(),
      dob: dob ? new Date(dob) : null,
      fatherName: fatherName.trim(),
      motherName: motherName ? motherName.trim() : '',
      rollNo: rollNo.trim(),
      slotNumber: slotNumber ? parseInt(slotNumber) : null,
      password: '' // Empty initially, admin can generate later
    });
    
    await student.save();
    
    console.log(`✅ New student created: ${student.name} (${student.email})`);
    
    res.status(201).json({
      success: true,
      message: 'Student created successfully!',
      student: student
    });
    
  } catch (error) {
    console.error('❌ Error creating student:', error);
    res.status(500).json({ 
      error: 'Failed to create student: ' + error.message 
    });
  }
});
// ============ STUDENT LOGIN ============
router.post('/student-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log(`🔑 Student login attempt: ${email}`);
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student) {
      console.log(`❌ Student not found: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isPasswordValid = await student.comparePassword(password);
    if (!isPasswordValid) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log(`✅ Student login successful: ${student.name}`);
    
    // ✅ FETCH BATCH FROM BOOTCAMP STUDENT COLLECTION
    const bootcampStudent = await BootcampStudent.findOne({ email: email.toLowerCase().trim() });
    const batch = bootcampStudent ? bootcampStudent.batch : null;
    
    console.log(`📦 Batch for ${student.name}: ${batch || 'Not assigned'}`);
    
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { 
        id: student._id, 
        email: student.email,
        role: 'student',
        name: student.name
      },
      process.env.JWT_SECRET || 'fallback_secret_key',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      message: 'Login successful!',
      token,
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        branch: student.branch,
        rollNo: student.rollNo,
        phoneNo: student.phoneNo,
        fatherName: student.fatherName,
        motherName: student.motherName,
        dob: student.dob,
        slotNumber: student.slotNumber,
        batch: batch,  // ✅ BATCH ADDED!
        profileImage: student.profileImage || null
      }
    });
    
  } catch (error) {
    console.error('❌ Student login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// ============ STUDENT: Change password (knows old password) ============
// Public route (student isn't logged in yet on this screen) — the app
// sends { email, oldPassword, newPassword }. We verify oldPassword against
// the stored password before allowing the change.
// Student.password is stored as plain text — no hashing.
router.post('/reset-password', async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    if (!email || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Email, old password and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const student = await Student.findOne({ email: email.toLowerCase().trim() });
    if (!student) {
      return res.status(404).json({ error: 'No student account found with this email.' });
    }

    const isMatch = await student.comparePassword(oldPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Old password is incorrect.' });
    }

    student.password = newPassword;
    student.updatedAt = new Date();
    await student.save();

    console.log(`🔑 Password reset for student: ${student.email}`);

    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) {
    console.error('❌ Student reset-password error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;