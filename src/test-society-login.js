const axios = require('axios');

async function testSocietyLogin() {
  try {
    console.log('🔍 Testing society login...');
    
    const response = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'froshtiet@thapar.edu',
      password: 'frosh@123'
    });
    
    console.log('✅ Society login successful!');
    console.log('Token:', response.data.token);
    console.log('Society:', response.data.society.societyName);
    
    // Save token for next step
    console.log('\n💡 Use this token for member creation:');
    console.log(response.data.token);
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
  }
}

testSocietyLogin();