const { all } = require('./backend/database');
async function test() {
  const d = await all('SELECT * FROM departments');
  console.log(d);
}
test();
