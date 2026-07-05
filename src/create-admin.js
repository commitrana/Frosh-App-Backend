const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const dotenv = require('dotenv');

dotenv.config();

async function createAdmin() {
  try {
    console.log('🔍 Creating admin account with Mongoose...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Delete any existing admin first
    await Admin.deleteMany({ username: 'admin' });
    console.log('✅ Cleared existing admin(s)');

    // Create new admin
    const admin = new Admin({
      username: 'admin',
      password: 'admin123'
    });

    await admin.save();
    console.log('✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Username: admin');
    console.log('🔑 Password: admin123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verify it was saved
    const savedAdmin = await Admin.findOne({ username: 'admin' });
    if (savedAdmin) {
      console.log('✅ Verified admin exists in database!');
      console.log('📧 Username:', savedAdmin.username);
      console.log('🆔 ID:', savedAdmin._id);
    }

    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
  }
}

createAdmin();