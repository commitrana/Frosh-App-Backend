const axios = require('axios');

async function testCreateMembers() {
  try {
    // First, login as society
    console.log('🔍 Logging in as society...');
    const loginResponse = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'froshtiet@thapar.edu',
      password: 'frosh@123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Society logged in successfully');
    console.log('Society:', loginResponse.data.society.societyName);
    
    // Create members for Slot 1
    console.log('\n🔍 Creating members for Slot 1...');
    const membersData = {
      slotNumber: 1,
      members: [
        {
          name: 'John Doe',
          branch: 'CSE',
          rollNo: '101',
          email: 'john@mail.com',
          password: 'john123'
        },
        {
          name: 'Jane Smith',
          branch: 'ECE',
          rollNo: '102',
          email: 'jane@mail.com',
          password: 'jane123'
        },
        {
          name: 'Bob Johnson',
          branch: 'ME',
          rollNo: '103',
          email: 'bob@mail.com',
          password: 'bob123'
        },
        {
          name: 'Alice Brown',
          branch: 'IT',
          rollNo: '104',
          email: 'alice@mail.com',
          password: 'alice123'
        },
        {
          name: 'Charlie Wilson',
          branch: 'CE',
          rollNo: '105',
          email: 'charlie@mail.com',
          password: 'charlie123'
        }
      ]
    };
    
    const response = await axios.post(
      'http://localhost:5000/api/member/create',
      membersData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Members created successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Failed:', error.response?.data || error.message);
  }
}

testCreateMembers();