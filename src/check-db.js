const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

async function checkDB() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    // Get all databases
    const dbs = await client.db().admin().listDatabases();
    console.log('📊 All databases:');
    dbs.databases.forEach(db => {
      console.log(`   - ${db.name} (${db.sizeOnDisk ? (db.sizeOnDisk/1024/1024).toFixed(2) + 'MB' : '0MB'})`);
    });
    
    // Check which database we're using
    const currentDB = client.db();
    console.log(`\n📌 Current database: ${currentDB.databaseName}`);
    
    // Check admins in current database
    const admins = await currentDB.collection('admins').find().toArray();
    console.log(`👥 Admins in current DB: ${admins.length}`);
    admins.forEach(a => {
      console.log(`   - ${a.username}`);
    });
    
    await client.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkDB();