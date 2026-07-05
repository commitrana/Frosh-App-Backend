const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const dotenv = require('dotenv');

dotenv.config();

async function createAdmin() {
  try {
    console.log('🔍 Creating admin account...');
    
    // Connect to MongoDB using Mongoose
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully!');

    // Check if admin exists
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (adminExists) {
      console.log('ℹ️ Admin already exists!');
      console.log('📧 Username:', adminExists.username);
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create admin
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
    console.log('⚠️  IMPORTANT: Change these credentials after first login!');

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