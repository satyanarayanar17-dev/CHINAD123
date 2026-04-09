const ACCOUNT_TYPES = {
  PATIENT: 'PATIENT',
  STAFF: 'STAFF'
};

const STAFF_ROLES = ['DOCTOR', 'NURSE', 'ADMIN'];
const PATIENT_ROLES = ['PATIENT'];

function normalizeAccountType(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const upper = value.trim().toUpperCase();
  return Object.values(ACCOUNT_TYPES).includes(upper) ? upper : null;
}

function accountTypeForRole(role) {
  if (PATIENT_ROLES.includes(role)) {
    return ACCOUNT_TYPES.PATIENT;
  }

  if (STAFF_ROLES.includes(role)) {
    return ACCOUNT_TYPES.STAFF;
  }

  return null;
}

function roleAllowedForAccountType(role, accountType) {
  return accountTypeForRole(role) === accountType;
}

function rolesForAccountType(accountType) {
  if (accountType === ACCOUNT_TYPES.PATIENT) {
    return [...PATIENT_ROLES];
  }

  if (accountType === ACCOUNT_TYPES.STAFF) {
    return [...STAFF_ROLES];
  }

  return [];
}

module.exports = {
  ACCOUNT_TYPES,
  STAFF_ROLES,
  PATIENT_ROLES,
  normalizeAccountType,
  accountTypeForRole,
  roleAllowedForAccountType,
  rolesForAccountType
};
