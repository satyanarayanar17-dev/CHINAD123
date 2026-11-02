const { all, get } = require('../database');
async function check() {
  const admin = await get('SELECT * FROM users WHERE id = "admin" OR role = "ADMIN"');
  console.log("Admin user:", admin);
  process.exit(0);
}
check();
