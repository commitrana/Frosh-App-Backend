const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function checkAdmin() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('society_portal');
    const admins = db.collection('admins');
    
    // Find admin
    const admin = await admins.findOne({ username: 'admin' });
    if (admin) {
      console.log('✅ Admin found:');
      console.log('📧 Username:', admin.username);
      console.log('🔑 Hashed Password (first 20 chars):', admin.password.substring(0, 20) + '...');
      
      // Test password
      const isMatch = await bcrypt.compare('admin123', admin.password);
      console.log('🔐 Password "admin123" match:', isMatch);
    } else {
      console.log('❌ Admin not found!');
      console.log('💡 Run: node src/seed-admin.js');
    }
    
    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAdmin();