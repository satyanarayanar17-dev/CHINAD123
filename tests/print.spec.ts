import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function shot(page: Page, file: string) {
 const target = path.join('qa-evidence', '04-print', file);
 mkdirSync(path.dirname(target), { recursive: true });
 await page.screenshot({ path: target, fullPage: true });
}

test.describe.serial('Prescription Print QA', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    page = await context.newPage();
  });

  async function staff(page: Page, id: string) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
    await page.locator('input[name=username]').fill(id);
    await page.locator('input[name=password]').fill('ChettinadDemo2026!');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.sidebar')).toBeVisible();
  }

  test('Create complex prescription for print', async () => {
    test.setTimeout(120000);
    await staff(page, 'demo_doctor');
    // Pick an existing patient that is in CONSULTATION
    const row = page.getByRole('row').filter({ hasText: 'Karthik Srinivasan (Demo)' });
    await row.getByRole('button', { name: 'Open consultation', exact: true }).click();
    
    await expect(page.locator('.workspace-toolbar')).toBeVisible();
    
    for (const name of ['history', 'examination', 'assessment', 'advice']) {
      await page.locator(`textarea[name="${name}"]`).fill(`QA Print Test ${name}`);
    }
    
    await page.getByRole('checkbox', { name: 'Older adult review (Demo)', exact: true }).check();
    
    // Add 8 medications with long text
    for(let i=0; i<8; i++){
      if (i > 0) {
        await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
      }
      await page.locator(`[name="medications.${i}.drug_id"]`).selectOption({ index: 1 });
      for (const [key, value] of Object.entries({
        dose: '1 tablet', frequency: 'Twice daily', duration: '30 days', 
        instructions: 'QA ONLY. This is synthetic print verification. ' + ('Long instruction text for wrapping and complete preservation. ').repeat(8)
      })) {
        await page.locator(`[name="medications.${i}.${key}"]`).fill(value);
      }
    }
    
    await page.getByRole('button', { name: 'Issue prescription & complete', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    
    // Sign out
    await page.locator('.sidebar nav').getByRole('button', { name: 'My profile & sessions', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  });

  test('Print Preview & PDF Generation', async () => {
    test.setTimeout(120000);
    
    // Login as patient
    await page.goto('/');
    await page.getByLabel('Mobile number').fill('9000000002'); // Karthik
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
    
    await expect(page.locator('.sidebar')).toBeVisible();
    
    await page.locator('.sidebar nav').getByRole('button', { name: 'Health record', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Prescriptions', exact: true }).click();
    
    // Click the first prescription
    await page.locator('.record-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    
    await expect(page.locator('.print-document')).toContainText('Karthik Srinivasan');
    
    // Emulate print media
    await page.emulateMedia({ media: 'print' });
    expect(await page.locator('.print-document').evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
    
    await shot(page, 'multi-medicine-print-media.png');
    await page.pdf({ path: 'qa-evidence/04-print/multi-medicine-a4.pdf', format: 'A4', printBackground: true });
    
    await page.emulateMedia({ media: 'screen' });
    await page.keyboard.press('Escape');
    
    // Also test single medicine (Meenakshi Sundaram)
    await page.locator('.sidebar nav').getByRole('button', { name: 'My profile & sessions', exact: true }).click();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    
    await page.getByLabel('Mobile number').fill('9000000006'); // Meenakshi
    requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
    await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
    sent = await requested;
    if (sent.status() === 429) {
      await page.waitForTimeout(61000);
      requested = page.waitForResponse(r => r.url().endsWith('/otp/request'));
      await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
      await requested;
    }
    const otp2 = await page.locator('.demo-code strong').innerText();
    await page.getByLabel('Verification code').fill(otp2);
    await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
    
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.locator('.sidebar nav').getByRole('button', { name: 'Health record', exact: true }).click();
    await page.locator('.tabs').getByRole('button', { name: 'Prescriptions', exact: true }).click();
    
    await page.locator('.record-row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await shot(page, 'single-medicine-print-media.png');
    await page.pdf({ path: 'qa-evidence/04-print/single-medicine-a4.pdf', format: 'A4', printBackground: true });
  });
});
