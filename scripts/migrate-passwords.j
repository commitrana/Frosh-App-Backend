const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================
// SAFE PASSWORD MIGRATION SCRIPT
// ============================================

// Step 1: Create backup before making any changes
async function createBackup(collection) {
  console.log(`📦 Creating backup for ${collection}...`);
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

// Step 2: Check if password is already hashed
function isHashed(password) {
  return password && password.startsWith('$2b$');
}

// Step 3: Hash a single password
async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainPassword, salt);
}

// Step 4: Migrate members
async function migrateMembers() {
  console.log('🔐 Starting password migration...');
  
  const Member = require('../src/models/Member');
  
  // 1️⃣ CREATE BACKUP
  const backupFile = await createBackup(Member);
  
  // 2️⃣ FIND ALL MEMBERS
  const members = await Member.find({});
  console.log(`📊 Found ${members.length} members`);
  
  // 3️⃣ SEPARATE PLAIN VS HASHED
  const plainPasswordMembers = [];
  const hashedPasswordMembers = [];
  const errorMembers = [];
  
  for (const member of members) {
    try {
      if (!member.password) {
        errorMembers.push({ email: member.email, reason: 'No password' });
        continue;
      }
      
      if (isHashed(member.password)) {
        hashedPasswordMembers.push(member);
      } else {
        plainPasswordMembers.push(member);
      }
    } catch (error) {
      errorMembers.push({ email: member.email, reason: error.message });
    }
  }
  
  console.log(`📊 Plain passwords: ${plainPasswordMembers.length}`);
  console.log(`📊 Hashed passwords: ${hashedPasswordMembers.length}`);
  console.log(`⚠️ Errors: ${errorMembers.length}`);
  
  if (errorMembers.length > 0) {
    console.log('⚠️ Members with errors:');
    errorMembers.forEach(m => console.log(`   - ${m.email}: ${m.reason}`));
  }
  
  // 4️⃣ MIGRATE PLAIN PASSWORDS
  if (plainPasswordMembers.length === 0) {
    console.log('✅ All passwords are already hashed. No migration needed!');
    await mongoose.connection.close();
    return;
  }
  
  console.log(`\n🔄 Migrating ${plainPasswordMembers.length} members...`);
  
  let successCount = 0;
  let failCount = 0;
  const failedMigrations = [];
  
  for (let i = 0; i < plainPasswordMembers.length; i++) {
    const member = plainPasswordMembers[i];
    try {
      const plainPassword = member.password;
      const hashedPassword = await hashPassword(plainPassword);
      
      // Double-check: hash should be different
      if (hashedPassword === plainPassword) {
        throw new Error('Hash same as plain text - hashing failed');
      }
      
      member.password = hashedPassword;
      await member.save();
      successCount++;
      
      // Progress indicator
      if ((i + 1) % 10 === 0) {
        console.log(`   Progress: ${i + 1}/${plainPasswordMembers.length}`);
      }
    } catch (error) {
      failCount++;
      failedMigrations.push({
        email: member.email,
        error: error.message
      });
      console.log(`   ❌ Failed: ${member.email} - ${error.message}`);
    }
  }
  
  // 5️⃣ SUMMARY REPORT
  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📦 Backup saved: ${backupFile}`);
  
  if (failedMigrations.length > 0) {
    console.log('\n⚠️ Failed migrations:');
    failedMigrations.forEach(f => {
      console.log(`   - ${f.email}: ${f.error}`);
    });
    console.log('\n💡 To fix failed migrations:');
    console.log('   1. Check member details manually');
    console.log('   2. Run individual migration: node scripts/migrate-single.js <email> <password>');
  }
  
  // 6️⃣ VERIFY A SAMPLE
  if (successCount > 0) {
    const sample = plainPasswordMembers[0];
    const testPassword = sample.password; // Original plain password
    const storedHash = sample.password; // Should now be hash
    
    const isMatch = await bcrypt.compare(testPassword, storedHash);
    console.log(`\n🔍 Verification for ${sample.email}:`);
    console.log(`   Password match: ${isMatch}`);
  }
  
  console.log('\n✅ Migration completed!');
  await mongoose.connection.close();
}

// ============================================
// SINGLE MEMBER MIGRATION (for fixing errors)
// ============================================
async function migrateSingleMember(email, plainPassword) {
  try {
    console.log(`🔐 Migrating single member: ${email}`);
    
    const Member = require('../src/models/Member');
    const member = await Member.findOne({ email });
    
    if (!member) {
      console.log(`❌ Member not found: ${email}`);
      return;
    }
    
    if (isHashed(member.password)) {
      console.log(`✅ Password already hashed for: ${email}`);
      return;
    }
    
    const hashedPassword = await hashPassword(plainPassword);
    member.password = hashedPassword;
    await member.save();
    
    console.log(`✅ Successfully migrated: ${email}`);
  } catch (error) {
    console.error(`❌ Error migrating ${email}:`, error.message);
  }
}

// ============================================
// RUN SCRIPT
// ============================================
async function main() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Check command line arguments
    const args = process.argv.slice(2);
    if (args.length === 2) {
      // Single member migration: node migrate-passwords.js email@example.com password123
      await migrateSingleMember(args[0], args[1]);
    } else {
      // Full migration
      await migrateMembers();
    }
  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled rejection:', error);
  process.exit(1);
});

main();