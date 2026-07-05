const mongoose = require('mongoose');
require('dotenv').config();

console.log('Testing MongoDB connection...');
console.log('URI:', process.env.MONGODB_URI);

mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
})
.then(() => {
  console.log('✅ SUCCESS! Connected to MongoDB');
  console.log('Database:', mongoose.connection.db.databaseName);
  process.exit(0);
})
.catch(err => {
  console.error('❌ FAILED:', err.message);
  console.error('Full error:', err);
  process.exit(1);
});