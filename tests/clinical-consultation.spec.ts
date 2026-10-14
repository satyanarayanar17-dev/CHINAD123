import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function shot(page: Page, file: string) {
 const target = path.join(process.env.CLINICAL_EVIDENCE_DIR || 'qa-evidence/03-clinical', file);
 mkdirSync(path.dirname(target), { recursive: true });
 await page.screenshot({ path: target, fullPage: true });
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
 const list: string[] = []; errors.set(page, list);
 page.on('pageerror', error => list.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

async function staff(page: Page, id: string) {
 await page.goto('/');
 await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
 await page.locator('input[name=username]').fill(id);
 await page.locator('input[name=password]').fill('ChettinadDemo2026!');
 await page.getByRole('button', { name: 'Sign in', exact: true }).click();
 await expect(page.locator('.sidebar')).toBeVisible();
}

async function logout(page: Page) {
 await page.locator('.sidebar nav').getByRole('button', { name: 'My profile & sessions', exact: true }).click();
 await page.getByRole('button', { name: 'Sign out', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
}

async function nav(page: Page, name: string) {
 await page.locator('.sidebar nav').getByRole('button', { name, exact: true }).click();
 await expect(page.locator('.main-content')).not.toContainText('Loading');
}

test.describe.serial('Clinical Journey', () => {
  let context: any;
  let page: Page;
  let followUpTime: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('Step 1: Patient registration/login, booking and own appointment display', async () => {
    test.setTimeout(120000);
    await page.goto('/');
    await page.getByLabel('Mobile number').fill('9000000009');
    let requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    const sent = await requested;
    if (sent.status() === 429) {
      await page.waitForTimeout(61000);
      requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
      await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
      await requested;
    }
    const otp = await page.locator('.demo-code strong').innerText();
    await page.getByLabel('Verification code').fill(otp);

    // Register
    await page.getByLabel('I am a new patient').check();
    await expect(page.getByLabel('Full name')).toBeVisible();
    await page.getByLabel('Full name').fill('Synthetic Patient QA');
    await page.getByLabel('Date of birth').fill('1990-01-01');
    await page.getByLabel('Gender').selectOption('Male');
    await page.getByLabel('Address').fill('123 Main St');
    await page.getByLabel('City').fill('Chennai');
    await page.getByLabel('State').fill('Tamil Nadu');
    await page.getByLabel('PIN code').fill('600001');
    await page.getByLabel('Emergency mobile').fill('9000000099');
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();

    await expect(page.locator('.sidebar')).toBeVisible();

    // Book
    await page.getByRole('button', { name: /Book Appointment/i }).first().click();
    await page.getByLabel('Doctor').selectOption({ label: 'Dr. Prabha S.' });
    await page.locator('.slot-grid button').first().click();
    await page.getByLabel(/Reason/i).fill('Initial consultation for QA');
    await page.getByRole('button', { name: 'Request Appointment', exact: true }).click();
    await expect(page.locator('.main-content')).not.toContainText('Loading');

    await nav(page, 'Appointments');
    await expect(page.locator('.main-content')).toContainText('Dr. Prabha S.');
    await shot(page, 'step1-patient-dashboard.png');

    await page.locator('.sidebar nav').getByRole('button', { name: 'My profile & sessions', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  });

  test('Step 2: Reception patient lookup, booking/rescheduling/cancellation, check-in', async () => {
    await staff(page, 'admin');

    await nav(page, 'Patients');
    await page.getByPlaceholder('Search name, MRN or mobile').fill('9000000009');

    // Book another
    await page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' }).getByRole('button', { name: 'Book appointment' }).click();
    await page.getByLabel('Doctor').selectOption({ label: 'Dr. Prabha S.' });
    await page.locator('.slot-grid button').nth(1).click();
    await page.getByLabel(/Reason/i).fill('Follow up for QA');
    await page.getByRole('button', { name: 'Request Appointment', exact: true }).click();

    await nav(page, 'Appointments');

    // Wait for the appointments list to load
    await expect(page.getByRole('row', { name: /Synthetic Patient QA/i }).first()).toBeVisible();

    // Confirm pending ones (the one from Step 1)
    const pendingRow = page.getByRole('row').filter({ hasText: 'Awaiting confirmation' }).first();
    await expect(pendingRow).toBeVisible();
    await pendingRow.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(pendingRow.getByRole('button', { name: 'Confirm', exact: true })).toBeHidden();

    // Reschedule the newly booked one (which is confirmed by default)
    // We book one, then cancel it, to test those flows, without affecting the main one.
    // The main one is the first one in the list (or the second one if sorted by time).
    // Let's just find the row for the newly booked one (Follow up for QA) and cancel it.
    // Wait, the UI doesn't show reason. We will just cancel the LAST one.
    await page.getByRole('row').filter({ hasText: 'Confirmed' }).last().getByRole('button', { name: 'Reschedule' }).click();
    await page.locator('.slot-grid button').nth(3).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reschedule', exact: true }).click();

    // Cancel the extra one
    await page.getByRole('row').filter({ hasText: 'Confirmed' }).last().getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Check-in the main one
    await page.getByRole('row').filter({ hasText: 'Confirmed' }).first().getByRole('button', { name: 'Check in' }).click();
    await page.getByRole('checkbox').check();
    await page.getByRole('dialog').getByRole('button', { name: 'Check in', exact: true }).click();

    await expect(page.getByRole('row').filter({ hasText: 'Waiting' })).toBeVisible();
    await shot(page, 'step2-reception-checkin.png');
    await logout(page);
  });

  test('Step 3: Nurse selection, input validation, vital signs, triage handoff', async () => {
    await staff(page, 'demo_nurse');
    const row = page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' });
    await row.getByRole('button', { name: 'Start triage', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    for (const [name, value] of Object.entries({
      temperature: '37.0', systolic: '118', diastolic: '78', pulse: '72', spo2: '99',
      weight: '70', height: '175', pain: '1', complaint: 'Routine checkup QA',
      allergies: 'None', notes: 'QA Triage completed'
    })) {
      await dialog.locator(`[name="${name}"]`).fill(value);
    }

    await shot(page, 'step3-nurse-triage.png');
    await dialog.locator('[name=allergy_review_status]').selectOption('RECORDED');
    await dialog.locator('[name=allergy_review_confirmed]').selectOption('yes');
    await dialog.locator('[name=allergy_change_reason]').fill('Synthetic patient-confirmed allergy review');
    await dialog.getByRole('button', { name: 'Complete triage & send to doctor', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText('Waiting for doctor');
    await logout(page);
  });

  test('Step 4 & 5: Doctor queue, consultation, medication selection, finalization', async () => {
    await staff(page, 'dr_prabha');
    const row = page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' });
    await row.getByRole('button', { name: 'Start consultation', exact: true }).click();

    await expect(page.locator('.workspace-toolbar')).toBeVisible();

    for (const name of ['history', 'examination', 'assessment', 'advice']) {
      await page.locator(`textarea[name="${name}"]`).fill(`Completed QA ${name}`);
    }
    await page.getByLabel('Normal Pregnancy').check();

    await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
    await page.locator('[name="medications.0.drug_id"]').selectOption({ index: 1 });
    for (const [key, value] of Object.entries({
      dose: '1 tablet', frequency: 'Twice daily', duration: '5 days', instructions: 'Take with food'
    })) {
      await page.locator(`[name="medications.0.${key}"]`).fill(value);
    }

    await shot(page, 'step4-doctor-consultation.png');

    // Save draft
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.locator('.workspace-toolbar')).toContainText('Version 1');

    // Lab order
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Laboratory', exact: true }).click();
    await page.getByLabel('Select a laboratory test').selectOption({ label: 'HbA1c (Demo) · DEMO-HBA1C' });
    await page.getByRole('button', { name: 'Order test', exact: true }).click();
    await expect(page.locator('.clinical-editor')).toContainText('HbA1c (Demo)');
    await shot(page, 'step6-doctor-lab-order.png');

    // Finalize
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Consultation', exact: true }).click();
    await page.getByLabel('Schedule a follow-up appointment', {exact:true}).check();
    const future = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA', {timeZone:'Asia/Kolkata'});
    await page.locator('.clinical-editor .slot-picker input[type=date]').fill(future);
    const followSlot = page.locator('.clinical-editor .slot-grid button').first();
    await expect(followSlot).toBeVisible();
    followUpTime = (await followSlot.innerText()).trim();
    await followSlot.click();
    await page.getByRole('button', { name: 'Issue prescription & complete', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Complete & book follow-up', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator('.workspace')).toHaveCount(0);
    await logout(page);
  });

  test('Step 6: Lab collection, processing, verified result entry, doctor review', async () => {
    // Nurse handles lab processing
    await staff(page, 'demo_nurse');
    await nav(page, 'Laboratory');

    // Process lab
    const lab = page.locator('.lab-card').filter({hasText:'Synthetic Patient QA'});
    await lab.getByRole('button', { name: 'Record sample collection', exact: true }).click();
    await lab.getByRole('button', { name: 'Start processing', exact: true }).click();
    await lab.getByRole('button', { name: 'Enter verified result', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Result value').fill('6.5');
    await dialog.getByLabel('Result flag').selectOption('HIGH');
    await dialog.getByLabel('I have verified this result against the source.').check();
    await dialog.getByLabel('Release result to patient').check();
    await dialog.getByLabel('Result source / reason for amendment').fill('Verified QA result');
    await shot(page, 'step6-lab-entry.png');
    await dialog.getByRole('button', { name: 'Save result', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await logout(page);

    // Doctor review
    await staff(page, 'dr_prabha');
    await nav(page, 'Laboratory');
    await page.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
    await shot(page, 'step6-doctor-review.png');
    await logout(page);
  });

  test('Step 7 & 8: Follow-up booking, draft/version protections, patient verification', async () => {
    test.setTimeout(120000);
    // Check patient portal
    await page.goto('/');
    await page.getByLabel('Mobile number').fill('9000000009');
    let requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    const sent = await requested;
    if (sent.status() === 429) {
      await page.waitForTimeout(61000);
      requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
      await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
      await requested;
    }
    const otp = await page.locator('.demo-code strong').innerText();
    await page.getByLabel('Verification code').fill(otp);
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();

    await nav(page, 'Appointments');
    await expect(page.locator('.main-content')).toContainText('Follow-up');
    await expect(page.locator('.main-content')).toContainText(followUpTime);
    await nav(page, 'Health record');
    await page.locator('.tabs').getByRole('button', { name: 'Prescriptions', exact: true }).click();
    await expect(page.locator('.record-row').first()).toContainText('Dr. Prabha S.');

    await nav(page, 'Laboratory');
    await expect(page.locator('.main-content')).toContainText('HbA1c (Demo)');

    await shot(page, 'step7-patient-portal.png');
  });
});
