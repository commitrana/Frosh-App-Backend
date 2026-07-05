const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

async function testMongo() {
  console.log('🔍 Testing MongoDB connection directly...');
  console.log('📦 Using URI:', process.env.MONGODB_URI.substring(0, 50) + '...');
  
  const client = new MongoClient(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000
  });

  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const db = client.db();
    console.log('📊 Database name:', db.databaseName);
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log('📚 Collections:', collections.map(c => c.name).join(', ') || 'No collections found');
    
    await client.close();
    console.log('✅ Disconnected');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Full error:', error);
  }
}

testMongo();