const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function migrateSingleMember(email, plainPassword) {
  try {
    console.log(`🔐 Migrating single member: ${email}`);
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    const Member = require('../src/models/Member');
    const member = await Member.findOne({ email });
    
    if (!member) {
      console.log(`❌ Member not found: ${email}`);
      return;
    }
    
    if (member.password && member.password.startsWith('$2b$')) {
      console.log(`✅ Password already hashed for: ${email}`);
      return;
    }
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    member.password = hashedPassword;
    await member.save();
    
    console.log(`✅ Successfully migrated: ${email}`);
  } catch (error) {
    console.error(`❌ Error migrating ${email}:`, error.message);
  } finally {
    await mongoose.connection.close();
  }
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.log('Usage: node migrate-single.js <email> <password>');
  console.log('Example: node migrate-single.js test@example.com password123');
  process.exit(1);
}

migrateSingleMember(args[0], args[1]);