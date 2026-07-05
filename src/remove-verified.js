const mongoose = require('mongoose');
const Society = require('./models/Society');
const dotenv = require('dotenv');

dotenv.config();

async function removeVerified() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Remove isVerified field from all societies
    const result = await Society.updateMany(
      {},
      { $unset: { isVerified: "" } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} societies`);

    await mongoose.disconnect();
    console.log('✅ Disconnected');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

removeVerified();