const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const pool = new Pool({ connectionString: 'postgresql://localhost:5432/chettinad_android_local' });
async function main() {
    try {
        const hash = await bcrypt.hash('Password123!', 10);
        await pool.query("UPDATE users SET password_hash = $1 WHERE id IN ('demo_admin', 'dr_mohan_rao', 'nurse_kavitha')", [hash]);
        console.log("Passwords reset successfully!");
    } catch(e) {
        console.error(e);
    }
    pool.end();
}
main();
