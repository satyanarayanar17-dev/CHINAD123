import {test,expect,type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
async function shot(page:Page,file:string){
 const target=path.join('qa-evidence',file);mkdirSync(path.dirname(target),{recursive:true});
 await page.screenshot({path:target,fullPage:true});
}
const errors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{
 const list:string[]=[];errors.set(page,list);
 page.on('pageerror',error=>list.push(error.message));
});
test.afterEach(async({page})=>{expect(errors.get(page)).toEqual([]);});

async function staff(page:Page,id:string){
 await page.goto('/');
 await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
 await page.locator('input[name=username]').fill(id);
 await page.locator('input[name=password]').fill('ChettinadDemo2026!');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeVisible();
}
async function scan(page:Page){
 const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 expect(results.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
}
async function nav(page:Page,name:string){
 await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();
 await expect(page.locator('.main-content')).not.toContainText('Loading');
}
test('reception screens, keyboard dialogs, accessible layout and mobile reflow',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Hospital staff',exact:true}).waitFor();await scan(page);
 await staff(page,'demo_admin');
 await scan(page);
 for(const name of ['Appointments','Live queue','Patients','Doctor schedules','Laboratory','Administration','Audit trail','My profile & sessions']){
  await nav(page,name);await scan(page);await shot(page,'04-admin/'+name.toLowerCase().replaceAll(' ','-')+'-pass.png');
 }
 await nav(page,'Patients');
 await page.getByRole('button',{name:'Register patient',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await scan(page);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open menu'}).click();
 await nav(page,'Overview');
 await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await scan(page);
});

test('nurse triage sends actual measurements to doctor queue',async({page})=>{
 await staff(page,'demo_nurse');
 const row=page.getByRole('row').filter({hasText:'Ananya Raman (Demo)'});
 await row.getByRole('button',{name:'Start triage',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog).toBeVisible();
 for(const [name,value] of Object.entries({temperature:'36.8',systolic:'120',diastolic:'80',pulse:'74',spo2:'98',weight:'62',height:'164',pain:'2',complaint:'Synthetic browser triage',allergies:'No known allergies',notes:'Browser acceptance fixture'})){
  await dialog.locator('[name="'+name+'"]').fill(value);
 }
 await scan(page);
 await dialog.getByRole('button',{name:'Complete triage & send to doctor',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(row).toContainText('Waiting for doctor');
});

test('doctor edits and persists consultation, creates lab order, finalizes encounter',async({page})=>{
 await staff(page,'demo_doctor');await shot(page,'02-doctor/doctor-dashboard-desktop-pass.png');
 const row=page.getByRole('row').filter({hasText:'Karthik Srinivasan (Demo)'});
 await row.getByRole('button',{name:'Open consultation',exact:true}).click();
 for(const name of ['history','examination','assessment','advice'])await page.locator('textarea[name="'+name+'"]').fill('Synthetic browser '+name);
 await page.getByRole('checkbox',{name:'Type 2 diabetes follow-up (Demo)',exact:true}).check();
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.locator('.workspace-toolbar')).toContainText('Version 2');await shot(page,'02-doctor/clinical-note-editor-pass.png');
 await scan(page);
 await page.getByRole('button',{name:'Back',exact:true}).click();
 await row.getByRole('button',{name:'Open consultation',exact:true}).click();
 await expect(page.locator('textarea[name=history]')).toHaveValue('Synthetic browser history');
 await page.getByRole('button',{name:'Add medicine',exact:true}).click();
 await page.getByRole('button',{name:'Remove 2',exact:true}).click();
 for(let i=1;i<=8;i++){
   await page.getByRole('button',{name:'Add medicine',exact:true}).click();
   await page.locator('[name="medications.'+i+'.drug_id"]').selectOption({index:1});
   for(const [key,value] of Object.entries({dose:'1 tablet',frequency:'Once daily — synthetic example',duration:'3 days',instructions:'QA ONLY. This is synthetic print verification. '+('Long instruction text for wrapping and complete preservation. ').repeat(8)}))
     await page.locator('[name="medications.'+i+'.'+key+'"]').fill(value);
 }
 await shot(page,'07-prescription/multi-medicine-builder-desktop-pass.png');
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[320,568],[360,800],[375,812],[390,844],[412,915],[768,1024],[820,1180],[844,390]]){
   await page.setViewportSize({width,height});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await shot(page,'06-mobile/doctor-builder-'+width+'x'+height+'-pass.png');
 }
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:'Save draft',exact:true}).click();
 await expect(page.locator('.workspace-toolbar')).toContainText('Version 3');
 await page.locator('.clinical-editor nav').getByRole('button',{name:'Laboratory',exact:true}).click();
 await page.getByLabel('Select a laboratory test').selectOption({label:'HbA1c (Demo) · DEMO-HBA1C'});
 await page.getByRole('button',{name:'Order test',exact:true}).click();
 await expect(page.locator('.clinical-editor')).toContainText('HbA1c (Demo)');
 await page.locator('.clinical-editor nav').getByRole('button',{name:'Consultation',exact:true}).click();
 await page.getByRole('button',{name:'Issue prescription & complete',exact:true}).click();
 const confirmation=page.getByRole('dialog');
 await expect(confirmation).toBeVisible();
 await confirmation.getByRole('button',{name:'Issue prescription & complete',exact:true}).click();
 await expect(confirmation).toHaveCount(0);
 await expect(page.locator('.workspace')).toHaveCount(0);
});

test('patient OTP, released results, prescription printing and translated mobile navigation',async({page},testInfo)=>{
 test.setTimeout(120000);
 await page.goto('/');
 await page.getByLabel('Mobile number').fill('9000000006');
 const requested=page.waitForResponse(r=>r.url().endsWith('/otp/request'));
 await page.getByRole('button',{name:'Send verification code',exact:true}).click();
 const sent=await requested;
 if(sent.status()===429){
   expect((await sent.json()).error.code).toBe('OTP_WAIT');
   // Seeder signed in this synthetic patient less than a minute ago. Respect OTP cooldown.
   await page.waitForTimeout(61000);
   await page.getByRole('button',{name:'Send verification code',exact:true}).click();
 }
 const otp=await page.locator('.demo-code strong').innerText();
 await page.getByLabel('Verification code').fill(otp);
 await page.getByRole('button',{name:'Verify & continue',exact:true}).click();
 await expect(page.locator('.sidebar')).toBeVisible();
 await nav(page,'Health record');
 await page.locator('.tabs').getByRole('button',{name:'Prescriptions',exact:true}).click();
 await page.locator('.record-row').first().click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.locator('.print-document')).toContainText('Meenakshi Sundaram (Demo)');
 await scan(page);
 await page.emulateMedia({media:'print'});
 expect(await page.locator('.print-document').evaluate(el=>getComputedStyle(el).visibility)).toBe('visible');
 expect(await page.locator('.print-document').evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThan(500);
 await page.pdf({path:'qa-evidence/08-print/single-medicine-a4.pdf',format:'A4',printBackground:true});
 await shot(page,'08-print/single-medicine-print-media-pass.png');
 await page.emulateMedia({media:'screen'});
 await page.keyboard.press('Escape');
 await nav(page,'Laboratory');await expect(page.locator('.main-content')).toContainText('Haemoglobin (Demo)');
 await scan(page);
 await page.setViewportSize({width:390,height:844});
 await page.getByLabel('Language').selectOption('ta');
 await expect(page.locator('html')).toHaveAttribute('lang','ta');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('மொழி').selectOption('te');
 await expect(page.locator('html')).toHaveAttribute('lang','te');
});
