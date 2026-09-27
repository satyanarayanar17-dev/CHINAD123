const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/chettinad_android_local' });
async function main() {
    const res = await pool.query("SELECT id, is_active, password_hash FROM users WHERE id='dr_mohan_rao'");
    console.log(res.rows[0]);
    pool.end();
}
main();
