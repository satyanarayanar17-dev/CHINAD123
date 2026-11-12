import { test, expect, type Page, type Response } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const patientName = 'Synthetic Patient QA', patientPhone = '9000000009';
test.use({ actionTimeout: 15000 });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = []; errors.set(page, list);
  page.on('pageerror', error => list.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function shot(page: Page, file: string) {
  const target = path.join(process.env.CLINICAL_EVIDENCE_DIR || 'qa-evidence/03-clinical', file);
  mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, fullPage: true });
}
async function staff(page: Page, id: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
  await page.locator('input[name=username]').fill(id);
  await page.locator('input[name=password]').fill('ChettinadDemo2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.sidebar')).toBeVisible();
}
async function logout(page: Page) {
  await page.locator('.topbar').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page.locator('.sidebar nav').getByRole('button', { name, exact: true }).click();
}
async function patient(page: Page) {
  await page.goto('/');
  await expect(page.getByLabel('I am a new patient')).toHaveCount(0);
  await page.getByLabel('Mobile number').fill(patientPhone);
  const sent = page.waitForResponse(r => r.url().endsWith('/otp/request'));
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  expect((await sent).status()).toBe(200);
  // This fixture is synthetic and loopback-only; real SMS is not bypassed.
  await page.getByLabel('Verification code').fill(await page.locator('.demo-code strong').innerText());
  const verified = page.waitForResponse(r => r.url().endsWith('/otp/verify'));
  await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  expect((await verified).status()).toBe(200);
  await expect(page.locator('.sidebar')).toContainText(patientName);
}
async function selectPatient(page: Page) {
  await nav(page, 'Patients');
  await page.getByPlaceholder('Search name, MRN or mobile').fill(patientPhone);
  await expect(page.locator('.directory-detail')).toContainText(patientName);
}
async function successful(response: Promise<Response>, status = 200) {
  const value = await response, body = await value.json();
  expect(value.status(), JSON.stringify(body)).toBe(status);
  return body;
}
function posted(page: Page, suffix: string) {
  return page.waitForResponse(r => r.url().endsWith(suffix) && r.request().method() === 'POST');
}

test('privacy and support are readable without an account at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ['privacy', 'support']) {
    expect((await page.goto(`/${name}.html`))?.status()).toBe(200);
    await expect(page.locator('body')).toContainText('Chettinad Medical Sciences');
    await expect(page.locator('body')).toContainText('satyanarayanr17@gmail.com');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shot(page, `public-${name}-mobile.png`);
  }
});

test.describe.serial('Doctor-provisioned clinical journey', () => {
  let patientId: string, encounterId: string, medicine: string;

  test('doctor creates access; patient signs in without self-registration or booking', async ({ page }) => {
    await staff(page, 'dr_prabha'); await nav(page, 'Patients');
    await expect(page.getByRole('button', { name: /Book appointment|Doctor schedules/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Register patient', exact: true }).click();
    const dialog = page.getByRole('dialog');
    for (const [name, value] of Object.entries({ name: patientName, phone: patientPhone, dob: '1990-01-01', address: 'Synthetic address', city: 'Chennai', state: 'Tamil Nadu', pin_code: '600001', emergency_contact: '9000000099' }))
      await dialog.locator(`[name="${name}"]`).fill(value);
    await dialog.locator('[name=gender]').selectOption('Female');
    await expect(dialog.getByRole('checkbox')).toBeChecked();
    const created = posted(page, '/opd/patients');
    await dialog.getByRole('button', { name: 'Register patient', exact: true }).click();
    const profile = await successful(created, 201); patientId = profile.id;
    expect(profile.assigned_doctor_id).toBe('dr_prabha'); expect(profile.portal_access_enabled).toBe(1);
    await expect(dialog).toHaveCount(0); await selectPatient(page);
    await expect(page.locator('.directory-detail')).toContainText('Mobile access enabled');
    await shot(page, '01-doctor-created-access.png'); await logout(page); await patient(page);
    await expect(page.getByRole('button', { name: /Book appointment|Request appointment/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
    await shot(page, '01-patient-access.png');
  });

  test('doctor starts one visit, resumes it safely, persists a draft and issues a prescription', async ({ page }) => {
    await staff(page, 'dr_prabha'); await selectPatient(page);
    let arrival = posted(page, `/patients/${patientId}/check-in`);
    await page.getByRole('button', { name: 'Start visit', exact: true }).click();
    encounterId = (await successful(arrival)).encounter_id;
    await expect(page.locator('.workspace-toolbar')).toBeVisible();
    await page.locator('.workspace-toolbar').getByRole('button', { name: 'Back', exact: true }).click();
    arrival = posted(page, `/patients/${patientId}/check-in`);
    await page.getByRole('button', { name: 'Start visit', exact: true }).click();
    expect((await successful(arrival)).encounter_id).toBe(encounterId);
    for (const name of ['complaint', 'history', 'examination', 'assessment', 'advice'])
      await page.locator(`textarea[name="${name}"]`).fill(`Synthetic QA ${name}`);
    await page.getByLabel('Normal Pregnancy').check();
    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    await page.locator('[name="medications.0.drug_id"]').selectOption({ index: 1 });
    medicine = (await page.locator('[name="medications.0.drug_id"] option:checked').innerText()).split(' — ')[0];
    for (const [key, value] of Object.entries({ dose: '1 tablet', frequency: 'Once daily', duration: '3 days', instructions: 'Synthetic QA instructions only' }))
      await page.locator(`[name="medications.0.${key}"]`).fill(value);
    const saved = page.waitForResponse(r => r.url().endsWith(`/encounters/${encounterId}/consultation`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await successful(saved);
    await expect(page.locator('.workspace-toolbar')).toContainText('Version 1');
    await page.locator('.workspace-toolbar').getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Start visit', exact: true }).click();
    await expect(page.locator('textarea[name=history]')).toHaveValue('Synthetic QA history');
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Laboratory', exact: true }).click();
    await page.getByLabel('Select a laboratory test').selectOption({ label: 'HbA1c (Demo) · DEMO-HBA1C' });
    await page.getByRole('button', { name: 'Order test', exact: true }).click();
    await expect(page.locator('.clinical-editor')).toContainText('HbA1c (Demo)');
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Consultation', exact: true }).click();
    await expect(page.getByLabel('Schedule a follow-up appointment')).toHaveCount(0);
    await shot(page, '02-doctor-prescription.png');
    await page.getByRole('button', { name: 'Issue prescription & complete', exact: true }).click();
    const completed = posted(page, `/encounters/${encounterId}/complete`);
    await page.getByRole('dialog').getByRole('button', { name: 'Complete without follow-up', exact: true }).click();
    await successful(completed); await expect(page.locator('.workspace')).toHaveCount(0);
  });

  test('verified lab results and signed prescriptions reach the patient and doctor', async ({ page }) => {
    await staff(page, 'demo_nurse'); await nav(page, 'Laboratory');
    const lab = page.locator('.lab-card').filter({ hasText: patientName });
    await lab.getByRole('button', { name: 'Record sample collection', exact: true }).click();
    await lab.getByRole('button', { name: 'Start processing', exact: true }).click();
    await lab.getByRole('button', { name: 'Enter verified result', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Result value').fill('6.5'); await dialog.getByLabel('Result flag').selectOption('HIGH');
    await dialog.getByLabel('I have verified this result against the source.').check();
    await dialog.getByLabel('Release result to patient').check();
    await dialog.getByLabel('Result source / reason for amendment').fill('Synthetic QA verified result');
    await dialog.getByRole('button', { name: 'Save result', exact: true }).click();
    await expect(dialog).toHaveCount(0); await logout(page);
    await staff(page, 'dr_prabha'); await nav(page, 'Laboratory');
    await page.locator('.lab-card').filter({ hasText: patientName }).getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await shot(page, '03-reviewed-laboratory.png'); await logout(page); await patient(page);
    await nav(page, 'Health record');
    await page.locator('.tabs').getByRole('button', { name: 'Prescriptions', exact: true }).click();
    await page.locator('.record-row').first().click();
    await expect(page.locator('.print-document')).toContainText(patientName);
    await expect(page.locator('.print-document')).toContainText(medicine);
    await page.keyboard.press('Escape'); await nav(page, 'Laboratory');
    await expect(page.locator('.main-content')).toContainText('HbA1c (Demo)');
    await expect(page.locator('.main-content')).toContainText('6.5'); await shot(page, '03-patient-results.png');
  });

  test('assigned doctor sets medication alerts, vital and activity tasks', async ({ page }) => {
    await staff(page, 'dr_prabha'); await selectPatient(page);
    await page.getByRole('button', { name: 'Medications & care plan', exact: true }).click();
    await page.getByRole('combobox', { name: 'Prescribed medication', exact: true }).selectOption({ index: 1 });
    // The disposable fixture clock is 10:00 IST, so these tasks are due now.
    await page.getByLabel('Alert time (IST)').fill('10:00');
    for (const type of ['MEDICATION', 'MEASUREMENT', 'ACTIVITY']) {
      await page.getByRole('combobox', { name: 'Task type', exact: true }).selectOption(type);
      if (type === 'MEASUREMENT') {
        await page.getByRole('combobox', { name: 'Vital', exact: true }).selectOption('PULSE');
        await page.getByLabel('Patient instructions').fill('Synthetic QA pulse task');
      }
      if (type === 'ACTIVITY') {
        await page.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('Walking');
        await page.getByLabel('Patient instructions').fill('Synthetic QA walking task');
      }
      const added = posted(page, `/care-plans/${patientId}/tasks`);
      await page.getByRole('button', { name: 'Add care task', exact: true }).click(); await successful(added, 201);
      await expect(page.getByRole('status').filter({ hasText: 'Care task shared with the patient' })).toBeVisible();
    }
    await expect(page.locator('.care-plan-progress')).toContainText('0 / 3'); await shot(page, '04-doctor-care-tasks.png');
  });

  test('patient completes all tasks and logs structured vital/activity values', async ({ page }) => {
    await patient(page); await nav(page, 'Care Plan');
    await expect(page.locator('.care-task')).toHaveCount(3);
    await expect(page.getByLabel('Alert time (IST)')).toHaveCount(0);
    await page.getByRole('button', { name: 'Mark taken', exact: true }).click();
    await page.getByRole('button', { name: 'Mark completed', exact: true }).click();
    await page.getByRole('button', { name: 'Record reading', exact: true }).click();
    const entry = page.getByRole('dialog');
    await entry.getByLabel('Reading').fill('72');
    await entry.getByRole('button', { name: 'Save reading', exact: true }).click();
    await expect(entry).toHaveCount(0); await expect(page.locator('.care-task-completed')).toHaveCount(3);
    await expect(page.locator('.care-plan-progress.care-plan-done')).toContainText('All your care tasks are complete.');
    await page.getByRole('combobox', { name: 'Log vital', exact: true }).selectOption('GLUCOSE');
    await entry.getByRole('combobox', { name: 'Type', exact: true }).selectOption('BLOOD_PRESSURE');
    await entry.getByLabel('Systolic').fill('118');
    await entry.getByLabel('Diastolic').fill('78');
    let stored = posted(page, `/patient-self-records/${patientId}`);
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    const bp = await successful(stored, 201); expect(bp.record_type).toBe('BLOOD_PRESSURE'); expect(bp.secondary_numeric_value).toBe(78);
    await expect(entry).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Log vital', exact: true }).selectOption('GLUCOSE');
    await entry.getByRole('combobox', { name: 'Timing', exact: true }).selectOption('BEFORE_BREAKFAST');
    await entry.getByLabel('Value (mg/dL)').fill('95');
    stored = posted(page, `/patient-self-records/${patientId}`);
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await successful(stored, 201)).timing_context).toBe('BEFORE_BREAKFAST'); await expect(entry).toHaveCount(0);
    await page.getByRole('button', { name: 'Log activity', exact: true }).click();
    await entry.getByRole('combobox', { name: 'Activity', exact: true }).selectOption('Running');
    await entry.getByLabel('Duration (minutes)').fill('12');
    stored = posted(page, `/patient-self-records/${patientId}`);
    await entry.getByRole('button', { name: 'Save', exact: true }).click();
    expect((await successful(stored, 201)).activity_name).toBe('Running'); await expect(entry).toHaveCount(0);
    await expect(page.locator('.main-content')).toContainText('Running · 12 min'); await shot(page, '05-patient-completed-care.png');
  });

  test('doctor sees green completion and exact patient entries after a fresh sign-in', async ({ page }) => {
    await staff(page, 'dr_prabha'); await selectPatient(page);
    await expect(page.locator('.care-plan-progress.care-plan-done')).toContainText('3 / 3');
    await page.getByRole('button', { name: 'Medications & care plan', exact: true }).click();
    await expect(page.locator('.record-row.care-plan-done')).toHaveCount(3);
    for (const value of ['118/78 mmHg', 'Running · 12 min', '95 mg/dL'])
      await expect(page.locator('.main-content')).toContainText(value);
    await shot(page, '06-doctor-completion.png');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await shot(page, '06-doctor-completion-mobile.png');
  });
});
