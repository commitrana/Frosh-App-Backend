const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================
// SAFE PASSWORD MIGRATION SCRIPT — Students
// (same approach as scripts/migrate-passwords.j, which does this for
// Members; the Student collection was storing plain-text passwords with
// no equivalent script, so this fills that gap.)
//
// Usage:
//   node scripts/migrate-student-passwords.js                 -> migrate all students
//   node scripts/migrate-student-passwords.js <email> <pass>  -> migrate one student
// ============================================

function isHashed(password) {
  return password && password.startsWith('$2b$');
}

async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

async function createBackup(collection) {
  console.log(`📦 Creating backup for ${collection.modelName}...`);
  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const data = await collection.find({}).lean();
  const backupFile = path.join(backupDir, `${collection.modelName}_backup_${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
  console.log(`✅ Backup saved: ${backupFile}`);
  return backupFile;
}

async function migrateStudents() {
  console.log('🔐 Starting student password migration...');

  const Student = require('../src/models/Student');

  const backupFile = await createBackup(Student);

  const students = await Student.find({});
  console.log(`📊 Found ${students.length} students`);

  const plainPasswordStudents = students.filter(s => s.password && !isHashed(s.password));
  const alreadyHashed = students.filter(s => s.password && isHashed(s.password));
  const noPassword = students.filter(s => !s.password);

  console.log(`📊 Plain-text passwords: ${plainPasswordStudents.length}`);
  console.log(`📊 Already hashed: ${alreadyHashed.length}`);
  console.log(`📊 No password set: ${noPassword.length}`);

  if (plainPasswordStudents.length === 0) {
    console.log('✅ Nothing to migrate — no plain-text passwords found.');
    return;
  }

  console.log(`\n🔄 Migrating ${plainPasswordStudents.length} students...`);

  let successCount = 0;
  let failCount = 0;
  const failedMigrations = [];

  for (let i = 0; i < plainPasswordStudents.length; i++) {
    const student = plainPasswordStudents[i];
    try {
      const plaintext = student.password;
      const hashedPassword = await hashPassword(plaintext);
      // Update directly via updateOne with the *already hashed* value so
      // the model's own hashing hook (which skips strings starting with
      // "$2b$") doesn't try to hash it a second time. Also copy the
      // plaintext into plainPassword — otherwise the admin dashboard loses
      // its only readable copy the moment this runs, since the hash can't
      // be reversed.
      await Student.updateOne(
        { _id: student._id },
        { $set: { password: hashedPassword, plainPassword: plaintext } }
      );
      successCount++;

      if ((i + 1) % 25 === 0) {
        console.log(`   Progress: ${i + 1}/${plainPasswordStudents.length}`);
      }
    } catch (error) {
      failCount++;
      failedMigrations.push({ email: student.email, rollNo: student.rollNo, error: error.message });
      console.log(`   ❌ Failed: ${student.email} - ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📦 Backup saved: ${backupFile}`);

  if (failedMigrations.length > 0) {
    console.log('\n⚠️ Failed migrations:');
    failedMigrations.forEach(f => console.log(`   - ${f.email} (${f.rollNo}): ${f.error}`));
  }

  console.log('\n✅ Migration completed!');
}

async function migrateSingleStudent(email, plainPassword) {
  const Student = require('../src/models/Student');
  const student = await Student.findOne({ email: email.toLowerCase().trim() });

  if (!student) {
    console.log(`❌ Student not found: ${email}`);
    return;
  }
  if (isHashed(student.password)) {
    console.log(`✅ Password already hashed for: ${email}`);
    return;
  }

  student.password = plainPassword; // pre('save') hook hashes it
  await student.save();
  console.log(`✅ Successfully migrated: ${email}`);
}

async function main() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const args = process.argv.slice(2);
    if (args.length === 2) {
      await migrateSingleStudent(args[0], args[1]);
    } else {
      await migrateStudents();
    }
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

main();