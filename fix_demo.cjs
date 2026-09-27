const fs = require('fs');
let content = fs.readFileSync('backend/opd/demo.cjs', 'utf8');
content = content.replace('const patient = patients.find(p => p.phone === scenario.phone);',
  'const patient = patients.find(p => p.phone === scenario.phone || p.phone === scenario.phone.replace("+91", "")); if(!patient) console.error("NO PATIENT FOUND IN", patients);');
fs.writeFileSync('backend/opd/demo.cjs', content);
