const { db } = require('./backend/database.js');

async function run() {
  const patientId = 'pat-30a1d71e-d8b6-4ef0-8014-d1e80c08b9be';
  try {
    await db.run('PRAGMA foreign_keys = OFF');
    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
    
    for (const { name } of tables) {
      if (name === 'patients') continue;
      
      const pragma = await db.all(`PRAGMA table_info(${name})`);
      const hasPatientId = pragma.some(col => col.name === 'patient_id');
      
      if (hasPatientId) {
        await db.run(`DELETE FROM ${name} WHERE patient_id = ?`, [patientId]);
        console.log(`Deleted from ${name}`);
      }
    }
    
    // Also delete any users associated with this patient just in case the col name is different?
    // Oh, users has patient_id.
    
    await db.run(`DELETE FROM patients WHERE id = ?`, [patientId]);
    console.log(`Deleted from patients`);
    
    await db.run('PRAGMA foreign_keys = ON');
    console.log('Success');
  } catch (e) {
    console.error(e);
  }
}
run();
