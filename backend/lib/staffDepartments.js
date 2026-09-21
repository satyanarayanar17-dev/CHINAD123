const STAFF_DEPARTMENTS = [
  'General Medicine',
  'Paediatrics',
  'Dermatology',
  'Psychiatry',
  'Pulmonology / Respiratory Medicine',
  'General Surgery',
  'Orthopaedics',
  'ENT / Otorhinolaryngology',
  'Ophthalmology',
  'Obstetrics & Gynaecology',
  'Cardiology',
  'Neurology',
  'Medical Gastroenterology',
  'Neonatology',
  'Neurosurgery',
  'Urology',
  'Cardiothoracic & Vascular Surgery',
  'Plastic Surgery',
  'Pathology',
  'Microbiology',
  'Biochemistry',
  'Radiology / Imaging',
  // Kept for compatibility / local
  'Emergency Medicine',
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

// Map old names to new names for compatibility
departmentMap.set(normalizeDepartmentKey('Orthopedics'), 'Orthopaedics');
departmentMap.set(normalizeDepartmentKey('Pediatrics'), 'Paediatrics');
departmentMap.set(normalizeDepartmentKey('Gynecology'), 'Obstetrics & Gynaecology');
departmentMap.set(normalizeDepartmentKey('ENT'), 'ENT / Otorhinolaryngology');
departmentMap.set(normalizeDepartmentKey('Pulmonology'), 'Pulmonology / Respiratory Medicine');
departmentMap.set(normalizeDepartmentKey('Gastroenterology'), 'Medical Gastroenterology');
departmentMap.set(normalizeDepartmentKey('Radiology'), 'Radiology / Imaging');

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
