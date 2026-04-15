import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDisplayRoleLabel,
  getExpectedAccountTypeForRole,
  getHomeRouteForSession,
  getHomeRouteForRole,
  getNavigationItemsForRole,
  isRouteAllowedForSession,
  isSessionBoundaryValid,
  shouldAttemptTokenRefresh,
  shouldRedirectToLoginPath
} from './roleBoundary.ts';

test('patients require the patient account type', () => {
  assert.equal(getExpectedAccountTypeForRole('patient'), 'patient');
  assert.equal(isSessionBoundaryValid('patient', 'patient'), true);
  assert.equal(isSessionBoundaryValid('patient', 'staff'), false);
});

test('staff roles require the staff account type', () => {
  assert.equal(getExpectedAccountTypeForRole('doctor'), 'staff');
  assert.equal(getExpectedAccountTypeForRole('nurse'), 'staff');
  assert.equal(getExpectedAccountTypeForRole('admin'), 'staff');
  assert.equal(isSessionBoundaryValid('doctor', 'staff'), true);
  assert.equal(isSessionBoundaryValid('nurse', 'staff'), true);
  assert.equal(isSessionBoundaryValid('admin', 'staff'), true);
});

test('mismatched or empty sessions are rejected', () => {
  assert.equal(isSessionBoundaryValid('doctor', 'patient'), false);
  assert.equal(isSessionBoundaryValid('nurse', 'patient'), false);
  assert.equal(isSessionBoundaryValid('admin', 'patient'), false);
  assert.equal(isSessionBoundaryValid(null, null), false);
});

test('home routes stay role-specific', () => {
  assert.equal(getHomeRouteForRole('patient'), '/patient/dashboard');
  assert.equal(getHomeRouteForRole('doctor'), '/clinical/command-center');
  assert.equal(getHomeRouteForRole('nurse'), '/operations/nurse-triage');
  assert.equal(getHomeRouteForRole('admin'), '/admin/dashboard');
  assert.equal(getHomeRouteForSession('doctor', 'patient'), '/login');
});

test('route access stays inside explicit role areas', () => {
  assert.equal(isRouteAllowedForSession('/clinical/command-center', 'doctor', 'staff'), true);
  assert.equal(isRouteAllowedForSession('/clinical/patient/pat-1/dossier', 'nurse', 'staff'), true);
  assert.equal(isRouteAllowedForSession('/clinical/patient/pat-1/note/new', 'nurse', 'staff'), false);
  assert.equal(isRouteAllowedForSession('/operations/prescriptions/pat-1/rx-1', 'nurse', 'staff'), true);
  assert.equal(isRouteAllowedForSession('/admin/dashboard', 'doctor', 'staff'), false);
  assert.equal(isRouteAllowedForSession('/patient/dashboard', 'doctor', 'staff'), false);
  assert.equal(isRouteAllowedForSession('/clinical/command-center', 'patient', 'patient'), false);
  assert.equal(isRouteAllowedForSession('/patient/activate', 'patient', 'patient'), true);
});

test('login redirect helper preserves public routes', () => {
  assert.equal(shouldRedirectToLoginPath('/patient/activate'), false);
  assert.equal(shouldRedirectToLoginPath('/about'), false);
  assert.equal(shouldRedirectToLoginPath('/login'), false);
  assert.equal(shouldRedirectToLoginPath('/clinical/command-center'), true);
});

test('token refresh only runs for authenticated 401s', () => {
  assert.equal(
    shouldAttemptTokenRefresh({
      status: 401,
      url: '/activation/claim',
      retried: false,
      hasAccessToken: false,
      hasAuthorizationHeader: false,
    }),
    false
  );
  assert.equal(
    shouldAttemptTokenRefresh({
      status: 401,
      url: '/patients/pat-1',
      retried: false,
      hasAccessToken: true,
      hasAuthorizationHeader: true,
    }),
    true
  );
  assert.equal(
    shouldAttemptTokenRefresh({
      status: 401,
      url: '/auth/refresh',
      retried: false,
      hasAccessToken: true,
      hasAuthorizationHeader: true,
    }),
    false
  );
});

test('navigation stays scoped per staff role', () => {
  assert.deepEqual(
    getNavigationItemsForRole('doctor').map((item) => item.to),
    ['/clinical/command-center', '/clinical/appointments']
  );
  assert.deepEqual(
    getNavigationItemsForRole('nurse').map((item) => item.to),
    ['/operations/nurse-triage']
  );
  assert.deepEqual(
    getNavigationItemsForRole('admin').map((item) => item.to),
    ['/admin/dashboard']
  );
  assert.deepEqual(getNavigationItemsForRole('patient'), []);
  assert.equal(getDisplayRoleLabel('doctor'), 'Doctor');
  assert.equal(getDisplayRoleLabel('admin'), 'Admin');
});
