const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/chettinad_android_local' });
async function main() {
    try {
        const res = await pool.query('SELECT id FROM diagnosis_catalog LIMIT 1');
        console.log(res.rows[0].id);
    } catch(e) {
        console.error(e);
    }
    pool.end();
}
main();
