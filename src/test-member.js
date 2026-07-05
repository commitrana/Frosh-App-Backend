const axios = require('axios');

async function testMemberLogin() {
  try {
    console.log('🔍 Testing member login...');
    
    const response = await axios.post('http://localhost:5000/api/member/login', {
      email: 'john@mail.com',
      password: 'john123'
    });
    
    console.log('✅ Login successful!');
    console.log('Member:', response.data.member);
    console.log('Token:', response.data.token);
    
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
  }
}

testMemberLogin();