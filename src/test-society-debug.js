const axios = require('axios');

async function testSocietyDebug() {
  try {
    console.log('🔍 Testing society login with debug...');
    
    // Try different credentials
    const testCredentials = [
      { email: 'froshtiet@thapar.edu', password: 'frosh@123' },
      { email: 'test@test.com', password: 'test123' },
      { email: 'tech@college.edu', password: 'tech123' }
    ];
    
    for (const creds of testCredentials) {
      console.log(`\n📝 Trying: ${creds.email} / ${creds.password}`);
      try {
        const response = await axios.post('http://localhost:5000/api/auth/login', creds);
        console.log('✅ SUCCESS!');
        console.log('Token:', response.data.token);
        console.log('Society:', response.data.society.societyName);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
      } catch (err) {
        console.log('❌ Failed:', err.response?.data?.error || err.message);
      }
    }
    
    console.log('\n💡 No valid credentials found.');
    console.log('💡 Create a new society in the admin panel and try again.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSocietyDebug();