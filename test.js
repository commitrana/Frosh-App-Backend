const mongoose = require('mongoose');
require('dotenv').config();

console.log('Testing MongoDB connection...');

// Try to connect
mongoose.connect(process.env.MONGODB_URI)
.then(() => {
    console.log('✅ SUCCESS! Connected to MongoDB Atlas!');
    console.log('📊 Database ready to use');
    process.exit(0);
})
.catch((err) => {
    console.error('❌ FAILED:', err.message);
    console.log('\n💡 Possible issues:');
    console.log('1. Cluster might be paused or creating');
    console.log('2. IP address not whitelisted');
    console.log('3. Wrong username/password');
    console.log('4. Cluster name is incorrect');
    process.exit(1);
});