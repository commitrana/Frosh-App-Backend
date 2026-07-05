const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function testAdminPassword() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('society_portal');
    const admins = db.collection('admins');
    
    // Find admin
    const admin = await admins.findOne({ username: 'admin' });
    if (!admin) {
      console.log('❌ Admin not found!');
      return;
    }
    
    console.log('✅ Admin found:');
    console.log('📧 Username:', admin.username);
    console.log('🔑 Hashed Password (first 20 chars):', admin.password.substring(0, 20) + '...');
    
    // Test with different password attempts
    const passwordsToTest = ['admin123', 'Admin123', 'password123', 'admin'];
    
    for (const testPwd of passwordsToTest) {
      const isMatch = await bcrypt.compare(testPwd, admin.password);
      console.log(`🔐 Password "${testPwd}": ${isMatch ? '✅ MATCHES!' : '❌ No match'}`);
    }
    
    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAdminPassword();