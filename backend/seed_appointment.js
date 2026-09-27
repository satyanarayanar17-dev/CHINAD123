const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/chettinad_android_local' });

async function main() {
    const res = await pool.query("SELECT id FROM patients WHERE phone = '+919000000001'");
    const patientId = res.rows[0].id;
    const date = new Date().toISOString().split('T')[0];
    
    // We will just book an appointment using the backend API via fetch so that all triggers run!
    // But we need a token.
    console.log("Patient:", patientId, "Date:", date);
    pool.end();
}
main();
