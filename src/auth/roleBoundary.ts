export type Role = 'doctor' | 'patient' | 'nurse' | 'admin' | null;
export type AccountType = 'patient' | 'staff' | null;

export function getExpectedAccountTypeForRole(role: Role): AccountType {
  if (role === 'patient') {
    return 'patient';
  }

  if (role === 'doctor' || role === 'nurse' || role === 'admin') {
    return 'staff';
  }

  return null;
}

export function isSessionBoundaryValid(role: Role, accountType: AccountType): boolean {
  if (!role || !accountType) {
    return false;
  }

  return getExpectedAccountTypeForRole(role) === accountType;
}

export function getHomeRouteForRole(role: Role): string {
  if (role === 'patient') {
    return '/patient/dashboard';
  }

  if (role === 'doctor') {
    return '/clinical/command-center';
  }

  if (role === 'nurse') {
    return '/operations/nurse-triage';
  }

  if (role === 'admin') {
    return '/admin/dashboard';
  }

  return '/login';
}
