const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function testConnection() {
  console.log('🔍 Testing MongoDB connection...');
  console.log('📦 Connection string:', process.env.MONGODB_URI.replace(/:[^:]*@/, ':****@'));
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ Connected successfully!');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    await mongoose.disconnect();
    console.log('✅ Disconnected');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('1. Check your internet connection');
    console.log('2. Verify MongoDB Atlas cluster is Active');
    console.log('3. Check IP whitelist in Network Access');
    console.log('4. Verify username and password');
  }
  process.exit(0);
}

testConnection();