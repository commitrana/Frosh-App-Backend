const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function createAdminDirect() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    console.log('🔍 Creating admin account directly...');
    await client.connect();
    console.log('✅ Connected to MongoDB');

    // Use the database from the connection string
    const db = client.db();
    console.log(`📌 Using database: ${db.databaseName}`);
    
    const admins = db.collection('admins');

    // Delete existing admin
    await admins.deleteMany({ username: 'admin' });
    console.log('✅ Cleared existing admin(s)');

    // Hash password
    const hashedPassword = await bcrypt.hash('admin123', 10);
    console.log('🔐 Password hashed');

    // Insert admin
    const result = await admins.insertOne({
      username: 'admin',
      password: hashedPassword,
      createdAt: new Date()
    });

    console.log('✅ Admin created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Username: admin');
    console.log('🔑 Password: admin123');
    console.log('🆔 ID:', result.insertedId);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Verify it was saved
    const savedAdmin = await admins.findOne({ username: 'admin' });
    if (savedAdmin) {
      console.log('✅ Verified admin exists in database!');
      console.log(`📌 Database: ${db.databaseName}`);
      console.log('📧 Username:', savedAdmin.username);
    }

    await client.close();
    console.log('✅ Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      await client.close();
    } catch (e) {}
    process.exit(1);
  }
}

createAdminDirect();