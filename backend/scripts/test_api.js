const http = require('http');
http.get('http://localhost:3001/api/v1/opd/directory', (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    console.log(data.substring(0, 500));
  });
});
