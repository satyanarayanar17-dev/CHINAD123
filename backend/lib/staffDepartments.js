const STAFF_DEPARTMENTS = [
  'General Medicine',
  'Cardiology',
  'Neurology',
  'Orthopedics',
  'Pediatrics',
  'Gynecology',
  'Dermatology',
  'ENT',
  'Pulmonology',
  'Gastroenterology',
  'Emergency Medicine',
  'Radiology',
  'Psychiatry',
  'Urology',
  'Nephrology',
  'Oncology'
];

function normalizeDepartmentKey(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const departmentMap = new Map(
  STAFF_DEPARTMENTS.map((department) => [normalizeDepartmentKey(department), department])
);

function getStaffDepartments() {
  return [...STAFF_DEPARTMENTS];
}

function resolveStaffDepartment(value) {
  return departmentMap.get(normalizeDepartmentKey(value)) || null;
}

module.exports = {
  STAFF_DEPARTMENTS,
  getStaffDepartments,
  resolveStaffDepartment
};
