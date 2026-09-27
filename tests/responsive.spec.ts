import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

async function shot(page: Page, file: string, projectName: string) {
 const target = path.join('qa-evidence', '05-responsive', projectName.replace(/\s+/g, '-'), file);
 mkdirSync(path.dirname(target), { recursive: true });
 await page.screenshot({ path: target, fullPage: true });
}

async function checkOverflow(page: Page) {
  const badElements = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth && rect.width > window.innerWidth) {
        bad.push(el.tagName + '.' + el.className);
      }
    });
    return bad;
  });
  console.log('Bad elements:', badElements);
  
  const isNoOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(isNoOverflow).toBe(true);
}

test('Responsive Layout Verification', async ({ page }, testInfo) => {
  // Public pages and patient login
  await page.goto('/');
  await checkOverflow(page);
  await shot(page, '1-landing.png', testInfo.project.name);

  await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
  await checkOverflow(page);
  await shot(page, '2-staff-login.png', testInfo.project.name);

  // Staff dashboard and queues
  await page.locator('input[name=username]').fill('demo_admin');
  await page.locator('input[name=password]').fill('ChettinadDemo2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.topbar')).toBeVisible();
  
  // Overview page
  await checkOverflow(page);
  await shot(page, '3-admin-overview.png', testInfo.project.name);
  
  // Appointments page
  await page.goto('/staff/appointments');
  await expect(page.locator('.main-content')).not.toContainText('Loading');
  await checkOverflow(page);
  await shot(page, '4-admin-appointments.png', testInfo.project.name);
  
  // Sign out admin
  await page.context().clearCookies();
  await page.goto('/');
  await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();

  // Doctor workspace and clinical editor
  await page.locator('input[name=username]').fill('demo_doctor');
  await page.locator('input[name=password]').fill('ChettinadDemo2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.topbar')).toBeVisible();

  // Click the open consultation button in the table
  const row = page.getByRole('row').filter({ hasText: 'Karthik' }).first();
  await row.getByRole('button', { name: 'Open consultation', exact: true }).click();
  
  await expect(page.locator('.workspace-toolbar')).toBeVisible();
  await checkOverflow(page);
  await shot(page, '5-doctor-consultation-base.png', testInfo.project.name);

  // Expand the workspace with medications
  await page.getByRole('button', { name: 'Add medicine', exact: true }).click();
  await page.locator(`[name="medications.0.drug_id"]`).selectOption({ index: 1 });
  for (const [key, value] of Object.entries({
    dose: '1 tablet', frequency: 'Twice daily', duration: '30 days', 
    instructions: 'Long instruction text to verify grid constraints and overflow prevention in responsive testing viewports.'
  })) {
    await page.locator(`[name="medications.0.${key}"]`).fill(value);
  }
  
  // Check overflow again after adding a complex row
  await checkOverflow(page);
  await shot(page, '6-doctor-consultation-meds.png', testInfo.project.name);

  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.locator('.workspace-toolbar')).toContainText('Draft');
});
