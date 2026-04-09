import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getExpectedAccountTypeForRole,
  getHomeRouteForRole,
  isSessionBoundaryValid
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
});
