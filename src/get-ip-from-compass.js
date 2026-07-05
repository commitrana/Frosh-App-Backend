const { MongoClient } = require('mongodb');
const dns = require('dns');
const dotenv = require('dotenv');

dotenv.config();

async function getIPFromCompass() {
  console.log('🔍 Attempting to get MongoDB Atlas IP addresses...');
  
  // Try to resolve using different methods
  const hostname = 'societyportal.mcxtnkv.mongodb.net';
  
  // Method 1: Try getaddrinfo (system DNS)
  console.log('\n📌 Method 1: Using system DNS...');
  dns.lookup(hostname, { all: true, family: 4 }, (err, addresses) => {
    if (err) {
      console.error('❌ System DNS failed:', err.message);
    } else {
      console.log('✅ System DNS found:');
      addresses.forEach(addr => {
        console.log(`   IP: ${addr.address}`);
      });
    }
  });
  
  // Method 2: Try to connect using the SRV string but with IP
  console.log('\n📌 Method 2: Trying connection with IP from SRV...');
  
  // The SRV record should give us the actual hosts
  dns.resolveSrv('_mongodb._tcp.societyportal.mcxtnkv.mongodb.net', (err, records) => {
    if (err) {
      console.error('❌ SRV resolution failed:', err.message);
      console.log('\n💡 Since this fails, please check MongoDB Compass:');
      console.log('1. Open MongoDB Compass');
      console.log('2. Click on your connection');
      console.log('3. Look at the connection details');
      console.log('4. You should see IP addresses like:');
      console.log('   - 34.238.107.197');
      console.log('   - 3.237.84.166');
      console.log('   - 44.202.56.69');
      console.log('\n📝 Or open Command Prompt and run:');
      console.log('   nslookup societyportal.mcxtnkv.mongodb.net');
    } else {
      console.log('✅ SRV records found:');
      records.forEach(record => {
        console.log(`   ${record.name}:${record.port}`);
      });
    }
  });
}

getIPFromCompass();