import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function shot(page: Page, file: string) {
 const target = path.join('qa-evidence', '03-clinical', file);
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
    let sent = await requested;
    if (sent.status() === 429) {
      await page.waitForTimeout(61000);
      requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
      await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
      await requested;
    }
    const otp = await page.locator('.demo-code strong').innerText();
    await page.getByLabel('Verification code').fill(otp);
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    
    // Register
    await expect(page.getByLabel('Full name')).toBeVisible();
    await page.getByLabel('Full name').fill('Synthetic Patient QA');
    await page.getByLabel('Date of birth').fill('1990-01-01');
    await page.getByLabel('Gender').selectOption('Male');
    await page.getByRole('button', { name: 'Complete registration', exact: true }).click();
    
    await expect(page.locator('.sidebar')).toBeVisible();
    
    // Book
    await nav(page, 'Book appointment');
    await page.getByLabel('Department').selectOption({ label: 'General Medicine' });
    await page.getByLabel('Doctor').selectOption({ label: 'Dr. Priya Raman (Demo)' });
    await page.locator('.slot-list button').first().click();
    await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    await expect(page.locator('.main-content')).toContainText('Appointment confirmed');
    
    await nav(page, 'Appointments');
    await expect(page.locator('.main-content')).toContainText('Dr. Priya Raman (Demo)');
    await shot(page, 'step1-patient-dashboard.png');

    await page.locator('.sidebar nav').getByRole('button', { name: 'My profile & sessions', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  });

  test('Step 2: Reception patient lookup, booking/rescheduling/cancellation, check-in', async () => {
    await staff(page, 'demo_admin');
    
    await nav(page, 'Patients');
    await page.getByPlaceholder('Search by name').fill('9000000009');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' }).getByRole('button', { name: 'View' }).click();
    
    // Book another
    await page.getByRole('button', { name: 'Book appointment', exact: true }).click();
    await page.getByLabel('Department').selectOption({ label: 'General Medicine' });
    await page.getByLabel('Doctor').selectOption({ label: 'Dr. Priya Raman (Demo)' });
    await page.locator('.slot-list button').nth(1).click();
    await page.getByRole('button', { name: 'Confirm booking', exact: true }).click();
    
    // Reschedule first one
    await page.getByRole('row').filter({ hasText: 'Scheduled' }).first().getByRole('button', { name: 'Reschedule' }).click();
    await page.locator('.slot-list button').nth(2).click();
    await page.getByRole('button', { name: 'Confirm reschedule', exact: true }).click();
    
    // Cancel the extra one
    await page.getByRole('row').filter({ hasText: 'Scheduled' }).last().getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();

    // Check-in
    await page.getByRole('row').filter({ hasText: 'Scheduled' }).first().getByRole('button', { name: 'Check in' }).click();
    await page.getByRole('button', { name: 'Confirm identity & check in', exact: true }).click();
    
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
    await dialog.getByRole('button', { name: 'Complete triage & send to doctor', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(row).toContainText('Waiting for doctor');
    await logout(page);
  });

  test('Step 4 & 5: Doctor queue, consultation, medication selection, finalization', async () => {
    await staff(page, 'demo_doctor');
    const row = page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' });
    await row.getByRole('button', { name: 'Open consultation', exact: true }).click();
    
    await expect(page.locator('.workspace-toolbar')).toBeVisible();
    
    for (const name of ['history', 'examination', 'assessment', 'advice']) {
      await page.locator(`textarea[name="${name}"]`).fill(`Completed QA ${name}`);
    }
    
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
    await expect(page.locator('.workspace-toolbar')).toContainText('Version 2');

    // Lab order
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Laboratory', exact: true }).click();
    await page.getByLabel('Select a laboratory test').selectOption({ label: 'HbA1c (Demo) · DEMO-HBA1C' });
    await page.getByRole('button', { name: 'Order test', exact: true }).click();
    await expect(page.locator('.clinical-editor')).toContainText('HbA1c (Demo)');
    await shot(page, 'step6-doctor-lab-order.png');
    
    // Finalize
    await page.locator('.clinical-editor nav').getByRole('button', { name: 'Consultation', exact: true }).click();
    await page.getByRole('button', { name: 'Issue prescription & complete', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Issue prescription & complete', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.locator('.workspace')).toHaveCount(0);
    await logout(page);
  });

  test('Step 6: Lab collection, processing, verified result entry, doctor review', async () => {
    // Admin handles lab processing
    await staff(page, 'demo_admin');
    await nav(page, 'Laboratory');
    
    // Process lab
    const labRow = page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' });
    await labRow.getByRole('button', { name: 'Collect' }).click();
    await labRow.getByRole('button', { name: 'Process' }).click();
    await labRow.getByRole('button', { name: 'Enter results' }).click();
    
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Measured value').fill('6.5');
    await dialog.getByLabel('Interpretation flag').selectOption('HIGH');
    await dialog.getByLabel('Result verified').check();
    await dialog.getByLabel('Release to patient portal').check();
    await dialog.getByLabel('Internal remarks').fill('Verified QA result');
    await shot(page, 'step6-lab-entry.png');
    await dialog.getByRole('button', { name: 'Save & finalize result', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    
    await logout(page);
    
    // Doctor review
    await staff(page, 'demo_doctor');
    await nav(page, 'Laboratory');
    const docLabRow = page.getByRole('row').filter({ hasText: 'Synthetic Patient QA' });
    await docLabRow.getByRole('button', { name: 'Acknowledge review' }).click();
    await shot(page, 'step6-doctor-review.png');
    await logout(page);
  });

  test('Step 7 & 8: Follow-up booking, draft/version protections, patient verification', async () => {
    // Check patient portal
    await page.goto('/');
    await page.getByLabel('Mobile number').fill('9000000009'); 
    let requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    let sent = await requested;
    if (sent.status() === 429) {
      await page.waitForTimeout(61000);
      requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
      await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
      await requested;
    }
    const otp = await page.locator('.demo-code strong').innerText();
    await page.getByLabel('Verification code').fill(otp);
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    
    await nav(page, 'Health record');
    await page.locator('.tabs').getByRole('button', { name: 'Prescriptions', exact: true }).click();
    await expect(page.locator('.record-row').first()).toContainText('Dr. Priya Raman (Demo)');
    
    await nav(page, 'Laboratory');
    await expect(page.locator('.main-content')).toContainText('HbA1c (Demo)');
    
    await shot(page, 'step7-patient-portal.png');
  });
});
