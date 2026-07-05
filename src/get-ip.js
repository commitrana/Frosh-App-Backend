const dns = require('dns');

console.log('🔍 Finding IP address for MongoDB Atlas...');

dns.resolve4('societyportal.mcxtnkv.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('❌ DNS lookup failed:', err.message);
    console.log('\n💡 Trying alternative...');
    
    // Try to get SRV records
    dns.resolveSrv('_mongodb._tcp.societyportal.mcxtnkv.mongodb.net', (err2, records) => {
      if (err2) {
        console.error('❌ SRV lookup also failed:', err2.message);
        console.log('\n⚠️  Your network is blocking MongoDB Atlas DNS resolution.');
        console.log('Solutions:');
        console.log('1. Use a VPN');
        console.log('2. Connect to a different network');
        console.log('3. Use MongoDB Compass to test connection');
        console.log('4. Contact your network administrator');
        return;
      }
      console.log('✅ SRV records found:');
      records.forEach(record => {
        console.log(`   ${record.name}:${record.port} (priority: ${record.priority})`);
      });
    });
  } else {
    console.log('✅ IP Addresses found:');
    addresses.forEach((ip, index) => {
      console.log(`   ${index + 1}. ${ip}`);
    });
    console.log('\n📝 Use this in your .env file:');
    console.log(`MONGODB_URI=mongodb://karanbir_2110:Karan%40123@${addresses[0]}:27017/society_portal?ssl=true&authSource=admin&retryWrites=true&w=majority&appName=SocietyPortal`);
  }
});