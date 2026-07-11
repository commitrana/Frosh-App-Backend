const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { authAdmin } = require('../middleware/auth');

// ============ HELPER FUNCTION: Generate Password from Parents ============
const generatePasswordFromParents = (student) => {
  // Get father's initials
  const fatherName = student.fatherName || '';
  const fatherInitials = fatherName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('');
  
  // Get mother's initials
  const motherName = student.motherName || '';
  const motherInitials = motherName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('');
  
  // Get DOB in DDMMYYYY format
  const dob = student.dob || new Date();
  const day = String(dob.getDate()).padStart(2, '0');
  const month = String(dob.getMonth() + 1).padStart(2, '0');
  const year = dob.getFullYear();
  const dobString = `${day}${month}${year}`;
  
  // Special characters
  const specialChars = ['!', '@', '#', '$', '%', '&', '*'];
  const randomSpecial = specialChars[Math.floor(Math.random() * specialChars.length)];
  
  // Combine to create password
  let password = fatherInitials + motherInitials + dobString + randomSpecial;
  
  // If initials are empty, use fallback
  if (!fatherInitials || !motherInitials) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password = `STU${dobString}${random}${randomSpecial}`;
  }
  
  // Ensure password is at least 10 characters
  while (password.length < 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return password;
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

// ============ BULK UPDATE STUDENTS ============
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

// ============ BULK DELETE STUDENTS ============
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
          value = new Date(value).toISOString().split('T')[0];
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
    let errors = [];

    for (const studentData of students) {
      try {
        const student = new Student({
          name: studentData.name?.trim() || '',
          email: studentData.email?.trim() || '',
          password: studentData.password?.trim() || '',
          branch: studentData.branch?.trim() || '',
          phoneNo: studentData.phoneNo?.trim() || '',
          dob: new Date(studentData.dob),
          fatherName: studentData.fatherName?.trim() || '',
          motherName: studentData.motherName?.trim() || '',
          rollNo: studentData.rollNo?.trim() || '',
          slotNumber: parseInt(studentData.slotNumber) || 1
        });

        await student.save();
        imported++;
      } catch (error) {
        if (error.code === 11000) {
          errors.push(`Duplicate entry: ${studentData.email || studentData.rollNo}`);
        } else {
          errors.push(`Error: ${error.message}`);
        }
      }
    }

    res.json({
      message: `Imported ${imported} students`,
      imported,
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
    
    const newPassword = generatePasswordFromParents(student);
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
        motherName: student.motherName,
        dob: student.dob
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
        const newPassword = generatePasswordFromParents(student);
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
    
    // Validate required fields
    if (!name || !email || !branch || !phoneNo || !dob || !fatherName || !motherName || !rollNo) {
      return res.status(400).json({ 
        error: 'All fields are required: name, email, branch, phoneNo, dob, fatherName, motherName, rollNo' 
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
    
    // Create new student
    const student = new Student({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      branch: branch.trim(),
      phoneNo: phoneNo.trim(),
      dob: new Date(dob),
      fatherName: fatherName.trim(),
      motherName: motherName.trim(),
      rollNo: rollNo.trim(),
      slotNumber: parseInt(slotNumber) || 1,
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
// ============ STUDENT LOGIN ============
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
    
    if (student.password !== password) {
      console.log(`❌ Invalid password for: ${email}`);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    console.log(`✅ Student login successful: ${student.name}`);
    
    // ✅ FETCH BATCH FROM BOOTCAMP STUDENT COLLECTION
    const BootcampStudent = require('../models/BootcampStudent');
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
        batch: batch  // ✅ BATCH ADDED!
      }
    });
    
  } catch (error) {
    console.error('❌ Student login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router;