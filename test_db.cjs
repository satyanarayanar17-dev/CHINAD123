const db = require('./backend/database');
(async () => {
  const users = await db.all('SELECT * FROM users WHERE role="PATIENT"');
  console.log("USERS:", users);
  const patients = await db.all('SELECT * FROM patients');
  console.log("PATIENTS:", patients);
})();
