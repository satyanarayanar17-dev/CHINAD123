import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

// These checks use the rendered, API-backed application and disposable fixtures.
const source=fs.readFileSync('src/opd/i18n.tsx','utf8');
const words:Record<string,Record<string,string>>={};
for(const locale of ['en','ta','te']) {
 const match=source.match(new RegExp('const '+locale+'(?:[^=\\n]*) = (\\{[\\s\\S]*?\\n\\});'));
 if(!match) throw Error('Cannot load UI vocabulary for '+locale);
 words[locale]=vm.runInNewContext('('+match[1]+')');
}
const dimensions=[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:820,height:1180}];
const observations:unknown[]=[];
function dir(language:string){return `qa-evidence/${language==='ta'?'09-tamil':'10-telugu'}`;}
function t(language:string,key:string){return words[language][key]||words.en[key]||key;}
async function settle(page:Page){await expect(page.locator('.loading')).toHaveCount(0);await page.locator('body').evaluate(()=>document.fonts.ready);}
async function screen(page:Page,language:string,name:string){
 await settle(page);
 fs.mkdirSync(dir(language),{recursive:true});
 const viewport=page.viewportSize()!;
 const evidence=`${dir(language)}/${name}-${viewport.width}px.png`;
 await page.screenshot({path:evidence,fullPage:true,animations:'disabled'});
 const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,lang:document.documentElement.lang,offenders:Array.from(document.querySelectorAll('main,header,.page-heading,.panel,.workspace,.clinical-editor,.patient-header,.modal,.topbar,.breadcrumb,.topbar-actions,.btn')).map(el=>({tag:el.tagName,classes:el.className,right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width),text:el.textContent?.trim().slice(0,80)})).filter(el=>el.right>innerWidth+1)}));
 const ui=await page.locator('h1,h2,h3,.nav-item,.btn,.field>label,.status,.empty-state strong,.alert').allTextContents();
 const untranslated=ui.map(v=>v.trim().replace(/\s+\*$/,'')).filter(value=>Object.entries(words.en).some(([key,english])=>value===english&&words[language][key]!==english));
 const rawKeys=ui.map(v=>v.trim()).filter(value=>Boolean(words.en[value])&&words.en[value]!==value&&words[language][value]!==value);
 observations.push({language,name,evidence,...metrics,untranslated,rawKeys});
 fs.writeFileSync('qa-evidence/localization-observations.json',JSON.stringify(observations,null,2));
 expect.soft(metrics.scroll,`${language} ${name} document overflow at ${metrics.width}px; ${JSON.stringify(metrics.offenders)}`).toBeLessThanOrEqual(metrics.width+1);
 expect.soft(untranslated,`${language} ${name} untranslated UI`).toEqual([]);
 expect.soft(rawKeys,`${language} ${name} raw localization keys`).toEqual([]);
 expect.soft(await page.locator('body').innerText()).not.toContain('\uFFFD');
}
async function sizes(page:Page,language:string,name:string){for(const viewport of dimensions){await page.setViewportSize(viewport);await screen(page,language,name);}await page.setViewportSize({width:1440,height:900});}
async function nav(page:Page,language:string,key:string){
 if(await page.locator('.mobile-menu').isVisible())await page.locator('.mobile-menu').click();
 await page.locator('.sidebar nav').getByRole('button',{name:t(language,key),exact:true}).click();
 await settle(page);
}
async function switchTo(page:Page,language:string){await page.locator('.language-select').selectOption(language);await expect(page.locator('html')).toHaveAttribute('lang',language);}
async function staff(page:Page,language:string,id:string){
 await page.goto('/');await page.locator('.login-tabs button').nth(1).click();await switchTo(page,language);
 await page.locator('input[name=username]').fill(id);await page.locator('input[name=password]').fill('ChettinadDemo2026!');
 await page.getByRole('button',{name:t(language,'login'),exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();await settle(page);
}
async function logout(page:Page,language:string){await page.getByRole('button',{name:t(language,'logout'),exact:true}).click();await expect(page.locator('.login-card')).toBeVisible();}
async function dismiss(page:Page){await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);}

for(const language of ['ta','te']) {
 test.describe(language==='ta'?'Tamil':'Telugu',()=>{
  test.use({locale:`${language}-IN`});
  test('login, errors, registration and language persistence',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('/');await switchTo(page,language);await screen(page,language,'login-desktop');await sizes(page,language,'login-responsive');
   await page.locator('.login-tabs button').nth(1).click();
   await page.locator('input[name=username]').fill('qa_invalid_user');await page.locator('input[name=password]').fill('InvalidDemo2026!');
   await page.getByRole('button',{name:t(language,'login'),exact:true}).click();await expect(page.getByRole('alert')).toContainText(t(language,'INVALID_CREDENTIALS'));
   await screen(page,language,'invalid-credentials');
   await page.locator('input[name=username]').fill('   ');await page.getByRole('button',{name:t(language,'login'),exact:true}).click();
   await screen(page,language,'whitespace-validation');
   for(const next of ['en','ta','te','en',language]){await switchTo(page,next);await expect(page.locator('.login-card')).toBeVisible();}
   await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.login-card')).toBeVisible();
   expect(errors).toEqual([]);
  });
  test('reception screens and translated configuration forms',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_admin');
   await screen(page,language,'admin-overview');await sizes(page,language,'admin-overview-responsive');
   for(const key of ['appointments','queue','patients','schedules','laboratory','administration','audit','settings']){await nav(page,language,key);await screen(page,language,`admin-${key}`);}
   await nav(page,language,'patients');await page.getByRole('button',{name:t(language,'newRegistration'),exact:true}).click();
   await expect(page.getByRole('dialog')).toBeVisible();await screen(page,language,'patient-registration');await sizes(page,language,'patient-registration-responsive');await dismiss(page);
   await nav(page,language,'schedules');await page.getByRole('button',{name:t(language,'addSchedule'),exact:true}).click();await screen(page,language,'doctor-schedule-form');await dismiss(page);
   await nav(page,language,'administration');await page.getByRole('button',{name:t(language,'addStaff'),exact:true}).click();await screen(page,language,'staff-form');await dismiss(page);
   await page.getByRole('button',{name:t(language,'addItem'),exact:true}).click();await screen(page,language,'catalogue-form');await dismiss(page);
   await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.app-shell')).toBeVisible();await logout(page,language);expect(errors).toEqual([]);
  });
  test('nurse triage, server validation and responsive input controls',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_nurse');
   await screen(page,language,'nurse-queue');await sizes(page,language,'nurse-queue-responsive');
   const row=page.getByRole('row').filter({hasText:'Ananya Raman (Demo)'});
   const start=row.getByRole('button',{name:t(language,'startTriage'),exact:true});
   if(await start.count())await start.click();else await row.getByRole('button',{name:t(language,'triageTitle'),exact:true}).click();
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await settle(page);
   for(const [name,value] of Object.entries({temperature:'36.8',systolic:'90',diastolic:'100',pulse:'74',spo2:'98',weight:'62',height:'164',pain:'2',complaint:'QA synthetic localization intake',allergies:'No known allergies — QA',notes:'QA synthetic nurse record; intentionally retained as entered.'}))await dialog.locator('[name="'+name+'"]').fill(value);
   await dialog.getByRole('button',{name:t(language,'sendDoctor'),exact:true}).click();await expect(dialog.getByRole('alert')).toContainText(t(language,'VALIDATION_ERROR'));
   await screen(page,language,'nurse-triage-validation');await sizes(page,language,'nurse-triage-responsive');
   await dismiss(page);await logout(page,language);expect(errors).toEqual([]);
  });
  test('doctor consultation, prescription fields and record versions',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_doctor');
   await screen(page,language,'doctor-overview');
   const row=page.getByRole('row').filter({hasText:'Karthik Srinivasan (Demo)'});await row.getByRole('button',{name:t(language,'openConsultation'),exact:true}).click();
   await expect(page.locator('.workspace')).toBeVisible();await screen(page,language,'doctor-consultation');await sizes(page,language,'doctor-consultation-responsive');
   await page.locator('textarea[name=history]').fill(`QA localization ${language}: unchanged clinical text in the selected language interface.`);
   await page.getByRole('button',{name:t(language,'saveDraft'),exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
   await expect(page.locator('.workspace-toolbar')).toContainText(t(language,'version'));await screen(page,language,'doctor-saved-draft');
   for(const key of ['medications','laboratory','journey']){await page.locator('.clinical-editor nav').getByRole('button',{name:t(language,key),exact:true}).click();await screen(page,language,`doctor-${key}`);if(key==='medications')await sizes(page,language,'prescription-builder-responsive');}
   await page.getByRole('button',{name:t(language,'back'),exact:true}).click();
   await page.getByRole('row').filter({hasText:'Karthik Srinivasan (Demo)'}).getByRole('button',{name:t(language,'openRecord'),exact:true}).click();
   await page.locator('.tabs').getByRole('button',{name:t(language,'previousVisits'),exact:true}).click();await screen(page,language,'doctor-previous-visits');
   const history=page.locator('.version-history').first();await history.locator('summary').first().click();await history.locator('details summary').first().click();await screen(page,language,'doctor-version-history');
   await expect(page.locator('.main-content pre')).toHaveCount(0);expect(errors).toEqual([]);
  });
  test('patient OTP, own portal, booking and released prescription',async({page})=>{
   const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await switchTo(page,language);
   await page.getByLabel(t(language,'mobile'),{exact:false}).fill(language==='ta'?'9000000006':'9000000002');
   const response=page.waitForResponse(r=>r.url().endsWith('/otp/request'));await page.getByRole('button',{name:t(language,'sendOtp'),exact:true}).click();
   const result=await response;if(result.status()===429){await page.waitForTimeout(61000);await page.getByRole('button',{name:t(language,'sendOtp'),exact:true}).click();}
   await expect(page.locator('.demo-code strong')).toBeVisible();await screen(page,language,'patient-otp');
   await page.getByLabel(t(language,'code'),{exact:false}).fill(await page.locator('.demo-code strong').innerText());await page.getByRole('button',{name:t(language,'verify'),exact:true}).click();
   await expect(page.locator('.app-shell')).toBeVisible();await screen(page,language,'patient-overview');await sizes(page,language,'patient-portal-responsive');
   await page.getByRole('button',{name:t(language,'book'),exact:true}).click();await screen(page,language,'patient-booking-form');await sizes(page,language,'patient-booking-responsive');await dismiss(page);
   for(const key of ['appointments','queue','laboratory','settings']){await nav(page,language,key);await screen(page,language,`patient-${key}`);}
   await nav(page,language,'records');await page.locator('.tabs').getByRole('button',{name:t(language,'prescriptions'),exact:true}).click();await page.locator('.record-row').first().click();
   await expect(page.locator('.print-document')).toBeVisible();await screen(page,language,'patient-prescription');await sizes(page,language,'patient-prescription-responsive');await dismiss(page);
   await page.setViewportSize({width:390,height:844});for(const next of ['en','ta','te',language]){await switchTo(page,next);await expect(page.locator('.main-content')).toBeVisible();}
   await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.app-shell')).toBeVisible();await logout(page,language);expect(errors).toEqual([]);
  });
 });
}
