import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldForcePasswordChange } from './passwordChangeGate.ts';

test('frontend gate blocks app entry only for authenticated must-change sessions', () => {
  assert.equal(shouldForcePasswordChange('bootstrapping', true), false);
  assert.equal(shouldForcePasswordChange('unauthenticated', true), false);
  assert.equal(shouldForcePasswordChange('authenticated', false), false);
  assert.equal(shouldForcePasswordChange('authenticated', true), true);
});

test('frontend gate clears once password-change requirement is resolved', () => {
  assert.equal(shouldForcePasswordChange('authenticated', true), true);
  assert.equal(shouldForcePasswordChange('authenticated', false), false);
});
