const { all, run } = require('../database');
const { resolveStaffDepartment } = require('../lib/staffDepartments');

async function updateDepartments() {
  const departments = await all('SELECT * FROM departments');
  for (const dept of departments) {
    const newName = resolveStaffDepartment(dept.name);
    if (newName && newName !== dept.name) {
      await run('UPDATE departments SET name = ? WHERE id = ?', [newName, dept.id]);
    }
  }

  const users = await all('SELECT id, department FROM users WHERE department IS NOT NULL');
  for (const user of users) {
    const newDept = resolveStaffDepartment(user.department);
    if (newDept && newDept !== user.department) {
      await run('UPDATE users SET department = ? WHERE id = ?', [newDept, user.id]);
    }
  }
  console.log('Departments updated.');
  process.exit(0);
}
updateDepartments();
