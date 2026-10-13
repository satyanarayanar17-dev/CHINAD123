const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/v1/auth/staff/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const token = JSON.parse(data).token;
    http.get({
        hostname: 'localhost', port: 3001, path: '/api/v1/opd/dashboard',
        headers: { 'Authorization': 'Bearer ' + token }
    }, res2 => {
        let d = ''; res2.on('data', c => d += c);
        res2.on('end', () => console.log(d));
    });
  });
});
req.write(JSON.stringify({ id: 'demo_doctor', password: 'Password@123' }));
req.end();
