const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================
// REPAIR SCRIPT: Fix Student passwords that got corrupted to
// bcrypt hashes ($2b$...), regenerating them back to the normal
// readable pattern (Father+Mother initials + DOB + symbol) —
// the exact same logic used by the "Generate Password" button
// in routes/students.js (generatePasswordFromParents).
//
// SAFE BY DESIGN:
//   - Takes a full backup of the students collection BEFORE
//     touching anything (scripts/backups/Student_backup_<ts>.json)
//   - Only touches students whose password currently starts
//     with "$2b$" (i.e. looks hashed/corrupted)
//   - Students with a normal-looking password are left untouched
//   - Dry-run mode by default — run with --apply to actually save
//
// USAGE:
//   node scripts/repair-student-passwords.js            (dry run, shows what WOULD change)
//   node scripts/repair-student-passwords.js --apply     (actually fixes them)
// ============================================================

function isHashed(password) {
  return typeof password === 'string' && password.startsWith('$2b$');
}

// Exact same algorithm as generatePasswordFromParents() in routes/students.js
function generatePasswordFromParents(student) {
  const fatherName = student.fatherName || '';
  const fatherInitials = fatherName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('');

  const motherName = student.motherName || '';
  const motherInitials = motherName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .join('');

  const dob = student.dob || new Date();
  const day = String(dob.getDate()).padStart(2, '0');
  const month = String(dob.getMonth() + 1).padStart(2, '0');
  const year = dob.getFullYear();
  const dobString = `${day}${month}${year}`;

  const specialChars = ['!', '@', '#', '$', '%', '&', '*'];
  const randomSpecial = specialChars[Math.floor(Math.random() * specialChars.length)];

  let password = fatherInitials + motherInitials + dobString + randomSpecial;

  if (!fatherInitials || !motherInitials) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    password = random + dobString + randomSpecial;
  }

  return password;
}

async function createBackup(Student) {
  console.log('📦 Creating backup of students collection...');
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const data = await Student.find({}).lean();
  const backupFile = path.join(backupDir, `Student_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✅ Backup saved: ${backupFile} (${data.length} students)\n`);
  return backupFile;
}

async function main() {
  const applyChanges = process.argv.includes('--apply');

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const Student = require('../src/models/Student');

  await createBackup(Student);

  const students = await Student.find({});
  console.log(`📊 Total students: ${students.length}`);

  const corrupted = students.filter(s => isHashed(s.password));
  console.log(`⚠️  Corrupted (bcrypt-hashed) passwords found: ${corrupted.length}`);
  console.log(`✅ Normal passwords (untouched): ${students.length - corrupted.length}\n`);

  if (corrupted.length === 0) {
    console.log('Nothing to repair. Exiting.');
    await mongoose.connection.close();
    return;
  }

  if (!applyChanges) {
    console.log('🔍 DRY RUN — no changes saved. Preview of what would happen:\n');
    corrupted.slice(0, 10).forEach(s => {
      const preview = generatePasswordFromParents(s);
      console.log(`   ${s.name.padEnd(25)} ${s.email.padEnd(35)} -> ${preview}`);
    });
    if (corrupted.length > 10) {
      console.log(`   ...and ${corrupted.length - 10} more`);
    }
    console.log('\nRun again with --apply to actually fix these in the database:');
    console.log('   node scripts/repair-student-passwords.js --apply');
    await mongoose.connection.close();
    return;
  }

  console.log(`🔄 Repairing ${corrupted.length} students...\n`);
  let successCount = 0;
  let failCount = 0;
  const results = [];

  for (const student of corrupted) {
    try {
      const newPassword = generatePasswordFromParents(student);
      student.password = newPassword;
      student.updatedAt = new Date();
      await student.save();
      results.push({ name: student.name, email: student.email, newPassword });
      successCount++;
    } catch (error) {
      console.log(`   ❌ Failed: ${student.email} - ${error.message}`);
      failCount++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 REPAIR SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Fixed: ${successCount}`);
  console.log(`❌ Failed: ${failCount}\n`);

  // Save the new passwords to a file too, so you have a record of them
  const outFile = path.join(__dirname, 'backups', `repaired_passwords_${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`📝 New passwords saved to: ${outFile}`);
  console.log('   (share these with affected students, or have them use the');
  console.log('    "Generate" button in the admin panel to make a fresh one)');

  await mongoose.connection.close();
  console.log('\n👋 Disconnected from MongoDB');
}

main().catch(err => {
  console.error('❌ Script error:', err);
  process.exit(1);
});