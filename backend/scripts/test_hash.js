const bcrypt = require('bcryptjs'); // or bcrypt
const hash = '$2b$10$s9YaS5DK0kqdAcd3jN.pSOAyOUuCB9h1AhluaFTCf1orbXBeGHr3m';
const pass1 = 'ChettinadDemo2026!';
const pass2 = 'ChettinadInitial2026!';
async function test() {
  console.log('Match Demo2026:', await bcrypt.compare(pass1, hash));
  console.log('Match Initial2026:', await bcrypt.compare(pass2, hash));
}
test();
