const http = require('http');

const data = JSON.stringify({
  username: 'admin',
  password: 'admin123'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/admin/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('🔍 Testing login route...');
console.log('📤 Sending:', data);

const req = http.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('📥 Status:', res.statusCode);
    console.log('📥 Response:', responseData);
    
    try {
      const json = JSON.parse(responseData);
      if (json.token) {
        console.log('✅ Login successful!');
        console.log('Token:', json.token);
      } else {
        console.log('❌ Login failed:', json);
      }
    } catch (e) {
      console.log('❌ Invalid JSON response');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.write(data);
req.end();