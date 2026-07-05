const { MongoClient } = require('mongodb');

// Try to connect using your current .env URI
const uri = 'mongodb+srv://karanbir_2110:Karan%40123@societyportal.mcxtnkv.mongodb.net/society_portal?retryWrites=true&w=majority&appName=SocietyPortal';

console.log('🔍 Testing connection...');

async function test() {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });

  try {
    console.log('📡 Attempting to connect...');
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const db = client.db();
    console.log('📊 Database:', db.databaseName);
    
    const collections = await db.listCollections().toArray();
    console.log('📚 Collections:', collections.map(c => c.name).join(', '));
    
    await client.close();
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Trying to get more info...');
    console.log('Error details:', error);
  }
}

test();