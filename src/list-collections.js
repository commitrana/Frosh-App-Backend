const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function listCollections() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Use society_portal database explicitly
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('📊 Collections in database:');
    collections.forEach(c => {
      console.log(`   - ${c.name}`);
    });
    
    // Check if admins collection exists
    const adminCollection = collections.find(c => c.name === 'admins');
    if (adminCollection) {
      console.log('\n✅ admins collection exists!');
      
      // Count admins
      const count = await db.collection('admins').countDocuments();
      console.log(`📊 Number of admins: ${count}`);
      
      // Show all admins
      const admins = await db.collection('admins').find().toArray();
      admins.forEach(a => {
        console.log(`   - ${a.username} (${a._id})`);
      });
    } else {
      console.log('\n❌ admins collection does NOT exist!');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

listCollections();