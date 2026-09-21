const fs = require('fs');
let content = fs.readFileSync('src/pages/patient/PatientDashboard.tsx', 'utf8');
content = content.replace(
  '{/* Overview Grid */}',
  '{/* Today\'s Care Plan */}\n      <CarePlanWidget />\n\n      {/* Overview Grid */}'
);
fs.writeFileSync('src/pages/patient/PatientDashboard.tsx', content);
