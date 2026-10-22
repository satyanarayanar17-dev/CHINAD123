// PostgreSQL NUMERIC(12,4) values arrive as strings; the public measurement
// contract uses JSON numbers on both database engines and all native clients.
function measurementNumbers(row) {
  const result = { ...row };
  for (const key of ['numeric_value', 'secondary_numeric_value']) {
    if (result[key] != null) result[key] = Number(result[key]);
  }
  return result;
}
module.exports = { measurementNumbers };
