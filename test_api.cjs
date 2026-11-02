const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/v1/auth/staff/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const token = JSON.parse(data).token;
    
    // Fetch Queue
    http.get({
        hostname: 'localhost', port: 3000, path: '/api/v1/opd/queue',
        headers: { 'Authorization': 'Bearer ' + token }
    }, res2 => {
        let d = ''; res2.on('data', c => d += c);
        res2.on('end', () => console.log("QUEUE:", d.substring(0, 100)));
    });

    // Fetch Dashboard
    http.get({
        hostname: 'localhost', port: 3000, path: '/api/v1/opd/dashboard',
        headers: { 'Authorization': 'Bearer ' + token }
    }, res3 => {
        let d = ''; res3.on('data', c => d += c);
        res3.on('end', () => console.log("\nDASHBOARD:", d));
    });
    
    // Fetch Appointments
    http.get({
        hostname: 'localhost', port: 3000, path: '/api/v1/opd/appointments',
        headers: { 'Authorization': 'Bearer ' + token }
    }, res4 => {
        let d = ''; res4.on('data', c => d += c);
        res4.on('end', () => console.log("\nAPPOINTMENTS:", d.substring(0, 500)));
    });
  });
});
req.write(JSON.stringify({ id: 'demo_doctor', password: 'Password@123' }));
req.end();
