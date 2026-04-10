export type Role = 'doctor' | 'patient' | 'nurse' | 'admin' | null;
export type AccountType = 'patient' | 'staff' | null;

type KnownRole = Exclude<Role, null>;
type KnownAccountType = Exclude<AccountType, null>;

interface NavigationItem {
  label: string;
  to: string;
  section: 'doctor' | 'nurse' | 'admin';
}

const ACCOUNT_TYPE_BY_ROLE: Record<KnownRole, KnownAccountType> = {
  patient: 'patient',
  doctor: 'staff',
  nurse: 'staff',
  admin: 'staff',
};

const HOME_ROUTE_BY_ROLE: Record<KnownRole, string> = {
  patient: '/patient/dashboard',
  doctor: '/clinical/command-center',
  nurse: '/operations/nurse-triage',
  admin: '/admin/dashboard',
};

const STAFF_NAV_ITEMS: Record<Exclude<KnownRole, 'patient'>, NavigationItem[]> = {
  doctor: [
    { label: 'Command Center', to: '/clinical/command-center', section: 'doctor' },
    { label: 'Appointments', to: '/clinical/appointments', section: 'doctor' },
  ],
  nurse: [
    { label: 'Triage Pre-check', to: '/operations/nurse-triage', section: 'nurse' },
  ],
  admin: [
    { label: 'Operations Dashboard', to: '/admin/dashboard', section: 'admin' },
  ],
};

const ALLOWED_ROUTE_PREFIXES: Record<KnownRole, string[]> = {
  patient: ['/patient'],
  doctor: ['/clinical', '/settings'],
  nurse: ['/operations', '/clinical/patient', '/settings'],
  admin: ['/admin', '/settings'],
};

const PUBLIC_ROUTES = ['/', '/about', '/specialties', '/contact', '/login', '/patient/activate'];
const DISALLOWED_ROUTE_SUBSTRINGS: Partial<Record<KnownRole, string[]>> = {
  nurse: ['/note/', '/prescription/'],
};

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getExpectedAccountTypeForRole(role: Role): AccountType {
  return role ? ACCOUNT_TYPE_BY_ROLE[role] : null;
}

export function isSessionBoundaryValid(role: Role, accountType: AccountType): boolean {
  if (!role || !accountType) {
    return false;
  }

  return getExpectedAccountTypeForRole(role) === accountType;
}

export function getHomeRouteForRole(role: Role): string {
  return role ? HOME_ROUTE_BY_ROLE[role] : '/login';
}

export function getHomeRouteForSession(role: Role, accountType: AccountType): string {
  return isSessionBoundaryValid(role, accountType) ? getHomeRouteForRole(role) : '/login';
}

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => matchesRoutePrefix(pathname, route));
}

export function shouldRedirectToLoginPath(pathname: string | null | undefined): boolean {
  if (!pathname) {
    return true;
  }

  return pathname !== '/login' && !isPublicRoute(pathname);
}

export function shouldAttemptTokenRefresh({
  status,
  url,
  retried,
  hasAccessToken,
  hasAuthorizationHeader,
}: {
  status?: number | null;
  url?: string | null;
  retried: boolean;
  hasAccessToken: boolean;
  hasAuthorizationHeader: boolean;
}): boolean {
  if (status !== 401 || retried) {
    return false;
  }

  if (url?.includes('/auth/refresh')) {
    return false;
  }

  return hasAccessToken || hasAuthorizationHeader;
}

export function isRouteAllowedForSession(pathname: string, role: Role, accountType: AccountType): boolean {
  if (isPublicRoute(pathname)) {
    return true;
  }

  if (!isSessionBoundaryValid(role, accountType) || !role) {
    return false;
  }

  if ((DISALLOWED_ROUTE_SUBSTRINGS[role] || []).some((segment) => pathname.includes(segment))) {
    return false;
  }

  return ALLOWED_ROUTE_PREFIXES[role].some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function getNavigationItemsForRole(role: Role): NavigationItem[] {
  if (!role || role === 'patient') {
    return [];
  }

  return STAFF_NAV_ITEMS[role];
}

export function getDisplayRoleLabel(role: Role): string {
  if (!role) {
    return 'Guest';
  }

  if (role === 'admin') {
    return 'Admin';
  }

  if (role === 'nurse') {
    return 'Nurse';
  }

  if (role === 'doctor') {
    return 'Doctor';
  }

  return 'Patient';
}
