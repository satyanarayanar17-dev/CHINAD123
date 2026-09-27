const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/chettinad_android_local' });
async function main() {
    try {
        const res = await pool.query("SELECT id, name, phone FROM patients WHERE name LIKE '%Ananya%'");
        console.log(res.rows);
    } catch(e) {
        console.error(e);
    }
    pool.end();
}
main();
