const dns = require('dns');

console.log('Testing DNS resolution with Node.js...');

dns.lookup('societyportal.mcxtnkv.mongodb.net', (err, address, family) => {
  if (err) {
    console.error('❌ DNS lookup failed:', err.message);
  } else {
    console.log('✅ DNS lookup successful!');
    console.log('   IP Address:', address);
    console.log('   Family:', family === 4 ? 'IPv4' : 'IPv6');
    
    // Try to connect to this IP
    console.log('\n📦 Use this IP in your connection string:');
    console.log(`mongodb://karanbir_2110:Karan%40123@${address}:27017/society_portal?retryWrites=true&w=majority&appName=SocietyPortal`);
  }
});