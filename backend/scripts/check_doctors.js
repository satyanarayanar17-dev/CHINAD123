const { all } = require('../database');
async function check() {
  const users = await all('SELECT id, name, role, department FROM users WHERE role = "DOCTOR"');
  console.log(users);
  process.exit(0);
}
check();
