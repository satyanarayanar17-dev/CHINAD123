import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSuggestedTriagePriority,
  validateIdentity,
  validateTriageSubmission,
} from './nurseTriage.form.ts';

test('nurse triage requires doctor selection before push', () => {
  const errors = validateTriageSubmission({
    patientId: 'pat-123',
    doctorId: '',
    chiefComplaint: 'Fever and cough',
    triagePriority: 'URGENT',
    doctorsAvailable: 2,
  });

  assert.equal(errors.doctor, 'Doctor selection is required before handoff.');
});

test('nurse triage blocks push when no doctor is available', () => {
  const errors = validateTriageSubmission({
    patientId: 'pat-123',
    doctorId: '',
    chiefComplaint: 'Fever and cough',
    triagePriority: 'URGENT',
    doctorsAvailable: 0,
  });

  assert.equal(errors.doctor, 'No doctors are currently available for assignment.');
});

test('identity validation allows blank phone but rejects malformed phone', () => {
  const blankPhoneErrors = validateIdentity({
    name: 'Walk In',
    dob: '1995-08-20',
    gender: 'Female',
    phone: '',
  });
  assert.equal(blankPhoneErrors.phone, undefined);

  const invalidPhoneErrors = validateIdentity({
    name: 'Walk In',
    dob: '1995-08-20',
    gender: 'Female',
    phone: '123',
  });
  assert.equal(invalidPhoneErrors.phone, 'Phone must be a valid mobile number if entered.');
});

test('suggested triage priority escalates with EWS score', () => {
  assert.equal(buildSuggestedTriagePriority(0), 'LOW');
  assert.equal(buildSuggestedTriagePriority(2), 'STANDARD');
  assert.equal(buildSuggestedTriagePriority(4), 'URGENT');
  assert.equal(buildSuggestedTriagePriority(7), 'IMMEDIATE');
});
