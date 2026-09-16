# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: localization.spec.ts >> Tamil >> patient OTP, own portal, booking and released prescription
- Location: tests/localization.spec.ts:105:3

# Error details

```
Error: ta patient-portal-responsive document overflow at 320px; [{"tag":"DIV","classes":"topbar-actions","right":352,"width":196,"text":"Englishதமிழ்తెలుగు9+"}]

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    352
```

```
Error: ta patient-booking-responsive document overflow at 320px; [{"tag":"DIV","classes":"topbar-actions","right":352,"width":196,"text":"Englishதமிழ்తెలుగు9+"}]

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    352
```

```
Error: ta patient-prescription-responsive document overflow at 320px; [{"tag":"DIV","classes":"topbar-actions","right":331,"width":196,"text":"Englishதமிழ்తెలుగు9+"}]

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    331
```

# Page snapshot

```yaml
- main [ref=f1e3]:
  - generic [ref=f1e4]:
    - combobox "மொழி" [ref=f1e6]:
      - option "English"
      - option "தமிழ்" [selected]
      - option "తెలుగు"
    - generic [ref=f1e7]:
      - generic [ref=f1e14]:
        - strong [ref=f1e15]: செட்டிநாடு கேர்
        - generic [ref=f1e16]: இணைந்த புறநோயாளர் சேவை
      - paragraph [ref=f1e17]: மீண்டும் வரவேற்கிறோம்
      - heading "உங்கள் பராமரிப்பு ஒரே இடத்தில்" [level=2] [ref=f1e18]
      - paragraph [ref=f1e19]: நோயாளர்களுக்கும் மருத்துவமனை ஊழியர்களுக்கும் பாதுகாப்பான அணுகல்
      - generic [ref=f1e20]:
        - button "நோயாளர்" [pressed] [ref=f1e21] [cursor=pointer]
        - button "மருத்துவமனை ஊழியர்" [ref=f1e22] [cursor=pointer]
      - generic [ref=f1e23]:
        - generic [ref=f1e24]:
          - generic [ref=f1e25]: கைபேசி எண் *
          - textbox "கைபேசி எண்" [ref=f1e26]:
            - /placeholder: "+91"
        - button "சரிபார்ப்புக் குறியீட்டை அனுப்பு" [ref=f1e27] [cursor=pointer]
      - generic [ref=f1e30]: நோயாளர்களுக்கும் மருத்துவமனை ஊழியர்களுக்கும் பாதுகாப்பான அணுகல்
```

# Test source

```ts
  1   | import {test,expect,type Page} from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | import path from 'node:path';
  4   | import vm from 'node:vm';
  5   | 
  6   | // These checks use the rendered, API-backed application and disposable fixtures.
  7   | const source=fs.readFileSync('src/opd/i18n.tsx','utf8');
  8   | const words:Record<string,Record<string,string>>={};
  9   | for(const locale of ['en','ta','te']) {
  10  |  const match=source.match(new RegExp('const '+locale+'(?:[^=\\n]*) = (\\{[\\s\\S]*?\\n\\});'));
  11  |  if(!match) throw Error('Cannot load UI vocabulary for '+locale);
  12  |  words[locale]=vm.runInNewContext('('+match[1]+')');
  13  | }
  14  | const dimensions=[{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:820,height:1180}];
  15  | const observations:unknown[]=[];
  16  | function dir(language:string){return `qa-evidence/${language==='ta'?'09-tamil':'10-telugu'}`;}
  17  | function t(language:string,key:string){return words[language][key]||words.en[key]||key;}
  18  | async function settle(page:Page){await expect(page.locator('.loading')).toHaveCount(0);await page.locator('body').evaluate(()=>document.fonts.ready);}
  19  | async function screen(page:Page,language:string,name:string){
  20  |  await settle(page);
  21  |  fs.mkdirSync(dir(language),{recursive:true});
  22  |  const viewport=page.viewportSize()!;
  23  |  const evidence=`${dir(language)}/${name}-${viewport.width}px.png`;
  24  |  await page.screenshot({path:evidence,fullPage:true,animations:'disabled'});
  25  |  const metrics=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,lang:document.documentElement.lang,offenders:Array.from(document.querySelectorAll('main,header,.page-heading,.panel,.workspace,.clinical-editor,.patient-header,.modal,.topbar,.breadcrumb,.topbar-actions,.btn')).map(el=>({tag:el.tagName,classes:el.className,right:Math.round(el.getBoundingClientRect().right),width:Math.round(el.getBoundingClientRect().width),text:el.textContent?.trim().slice(0,80)})).filter(el=>el.right>innerWidth+1)}));
  26  |  const ui=await page.locator('h1,h2,h3,.nav-item,.btn,.field>label,.status,.empty-state strong,.alert').allTextContents();
  27  |  const untranslated=ui.map(v=>v.trim().replace(/\s+\*$/,'')).filter(value=>Object.entries(words.en).some(([key,english])=>value===english&&words[language][key]!==english));
  28  |  const rawKeys=ui.map(v=>v.trim()).filter(value=>Boolean(words.en[value])&&words.en[value]!==value&&words[language][value]!==value);
  29  |  observations.push({language,name,evidence,...metrics,untranslated,rawKeys});
  30  |  fs.writeFileSync('qa-evidence/localization-observations.json',JSON.stringify(observations,null,2));
> 31  |  expect.soft(metrics.scroll,`${language} ${name} document overflow at ${metrics.width}px; ${JSON.stringify(metrics.offenders)}`).toBeLessThanOrEqual(metrics.width+1);
      |                                                                                                                                  ^ Error: ta patient-prescription-responsive document overflow at 320px; [{"tag":"DIV","classes":"topbar-actions","right":331,"width":196,"text":"Englishதமிழ்తెలుగు9+"}]
  32  |  expect.soft(untranslated,`${language} ${name} untranslated UI`).toEqual([]);
  33  |  expect.soft(rawKeys,`${language} ${name} raw localization keys`).toEqual([]);
  34  |  expect.soft(await page.locator('body').innerText()).not.toContain('\uFFFD');
  35  | }
  36  | async function sizes(page:Page,language:string,name:string){for(const viewport of dimensions){await page.setViewportSize(viewport);await screen(page,language,name);}await page.setViewportSize({width:1440,height:900});}
  37  | async function nav(page:Page,language:string,key:string){
  38  |  if(await page.locator('.mobile-menu').isVisible())await page.locator('.mobile-menu').click();
  39  |  await page.locator('.sidebar nav').getByRole('button',{name:t(language,key),exact:true}).click();
  40  |  await settle(page);
  41  | }
  42  | async function switchTo(page:Page,language:string){await page.locator('.language-select').selectOption(language);await expect(page.locator('html')).toHaveAttribute('lang',language);}
  43  | async function staff(page:Page,language:string,id:string){
  44  |  await page.goto('/');await page.locator('.login-tabs button').nth(1).click();await switchTo(page,language);
  45  |  await page.locator('input[name=username]').fill(id);await page.locator('input[name=password]').fill('ChettinadDemo2026!');
  46  |  await page.getByRole('button',{name:t(language,'login'),exact:true}).click();await expect(page.locator('.app-shell')).toBeVisible();await settle(page);
  47  | }
  48  | async function logout(page:Page,language:string){await page.getByRole('button',{name:t(language,'logout'),exact:true}).click();await expect(page.locator('.login-card')).toBeVisible();}
  49  | async function dismiss(page:Page){await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);}
  50  | 
  51  | for(const language of ['ta','te']) {
  52  |  test.describe(language==='ta'?'Tamil':'Telugu',()=>{
  53  |   test.use({locale:`${language}-IN`});
  54  |   test('login, errors, registration and language persistence',async({page})=>{
  55  |    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  56  |    await page.goto('/');await switchTo(page,language);await screen(page,language,'login-desktop');await sizes(page,language,'login-responsive');
  57  |    await page.locator('.login-tabs button').nth(1).click();
  58  |    await page.locator('input[name=username]').fill('qa_invalid_user');await page.locator('input[name=password]').fill('InvalidDemo2026!');
  59  |    await page.getByRole('button',{name:t(language,'login'),exact:true}).click();await expect(page.getByRole('alert')).toContainText(t(language,'INVALID_CREDENTIALS'));
  60  |    await screen(page,language,'invalid-credentials');
  61  |    await page.locator('input[name=username]').fill('   ');await page.getByRole('button',{name:t(language,'login'),exact:true}).click();
  62  |    await screen(page,language,'whitespace-validation');
  63  |    for(const next of ['en','ta','te','en',language]){await switchTo(page,next);await expect(page.locator('.login-card')).toBeVisible();}
  64  |    await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.login-card')).toBeVisible();
  65  |    expect(errors).toEqual([]);
  66  |   });
  67  |   test('reception screens and translated configuration forms',async({page})=>{
  68  |    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_admin');
  69  |    await screen(page,language,'admin-overview');await sizes(page,language,'admin-overview-responsive');
  70  |    for(const key of ['appointments','queue','patients','schedules','laboratory','administration','audit','settings']){await nav(page,language,key);await screen(page,language,`admin-${key}`);}
  71  |    await nav(page,language,'patients');await page.getByRole('button',{name:t(language,'newRegistration'),exact:true}).click();
  72  |    await expect(page.getByRole('dialog')).toBeVisible();await screen(page,language,'patient-registration');await sizes(page,language,'patient-registration-responsive');await dismiss(page);
  73  |    await nav(page,language,'schedules');await page.getByRole('button',{name:t(language,'addSchedule'),exact:true}).click();await screen(page,language,'doctor-schedule-form');await dismiss(page);
  74  |    await nav(page,language,'administration');await page.getByRole('button',{name:t(language,'addStaff'),exact:true}).click();await screen(page,language,'staff-form');await dismiss(page);
  75  |    await page.getByRole('button',{name:t(language,'addItem'),exact:true}).click();await screen(page,language,'catalogue-form');await dismiss(page);
  76  |    await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.app-shell')).toBeVisible();await logout(page,language);expect(errors).toEqual([]);
  77  |   });
  78  |   test('nurse triage, server validation and responsive input controls',async({page})=>{
  79  |    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_nurse');
  80  |    await screen(page,language,'nurse-queue');await sizes(page,language,'nurse-queue-responsive');
  81  |    const row=page.getByRole('row').filter({hasText:'Ananya Raman (Demo)'});
  82  |    const start=row.getByRole('button',{name:t(language,'startTriage'),exact:true});
  83  |    if(await start.count())await start.click();else await row.getByRole('button',{name:t(language,'triageTitle'),exact:true}).click();
  84  |    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await settle(page);
  85  |    for(const [name,value] of Object.entries({temperature:'36.8',systolic:'90',diastolic:'100',pulse:'74',spo2:'98',weight:'62',height:'164',pain:'2',complaint:'QA synthetic localization intake',allergies:'No known allergies — QA',notes:'QA synthetic nurse record; intentionally retained as entered.'}))await dialog.locator('[name="'+name+'"]').fill(value);
  86  |    await dialog.getByRole('button',{name:t(language,'sendDoctor'),exact:true}).click();await expect(dialog.getByRole('alert')).toContainText(t(language,'VALIDATION_ERROR'));
  87  |    await screen(page,language,'nurse-triage-validation');await sizes(page,language,'nurse-triage-responsive');
  88  |    await dismiss(page);await logout(page,language);expect(errors).toEqual([]);
  89  |   });
  90  |   test('doctor consultation, prescription fields and record versions',async({page})=>{
  91  |    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await staff(page,language,'demo_doctor');
  92  |    await screen(page,language,'doctor-overview');
  93  |    const row=page.getByRole('row').filter({hasText:'Karthik Srinivasan (Demo)'});await row.getByRole('button',{name:t(language,'openConsultation'),exact:true}).click();
  94  |    await expect(page.locator('.workspace')).toBeVisible();await screen(page,language,'doctor-consultation');await sizes(page,language,'doctor-consultation-responsive');
  95  |    await page.locator('textarea[name=history]').fill(`QA localization ${language}: unchanged clinical text in the selected language interface.`);
  96  |    await page.getByRole('button',{name:t(language,'saveDraft'),exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
  97  |    await expect(page.locator('.workspace-toolbar')).toContainText(t(language,'version'));await screen(page,language,'doctor-saved-draft');
  98  |    for(const key of ['medications','laboratory','journey']){await page.locator('.clinical-editor nav').getByRole('button',{name:t(language,key),exact:true}).click();await screen(page,language,`doctor-${key}`);if(key==='medications')await sizes(page,language,'prescription-builder-responsive');}
  99  |    await page.getByRole('button',{name:t(language,'back'),exact:true}).click();
  100 |    await page.getByRole('row').filter({hasText:'Karthik Srinivasan (Demo)'}).getByRole('button',{name:t(language,'openRecord'),exact:true}).click();
  101 |    await page.locator('.tabs').getByRole('button',{name:t(language,'previousVisits'),exact:true}).click();await screen(page,language,'doctor-previous-visits');
  102 |    const history=page.locator('.version-history').first();await history.locator('summary').first().click();await history.locator('details summary').first().click();await screen(page,language,'doctor-version-history');
  103 |    await expect(page.locator('.main-content pre')).toHaveCount(0);expect(errors).toEqual([]);
  104 |   });
  105 |   test('patient OTP, own portal, booking and released prescription',async({page})=>{
  106 |    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await switchTo(page,language);
  107 |    await page.getByLabel(t(language,'mobile'),{exact:false}).fill(language==='ta'?'9000000006':'9000000002');
  108 |    const response=page.waitForResponse(r=>r.url().endsWith('/otp/request'));await page.getByRole('button',{name:t(language,'sendOtp'),exact:true}).click();
  109 |    const result=await response;if(result.status()===429){await page.waitForTimeout(61000);await page.getByRole('button',{name:t(language,'sendOtp'),exact:true}).click();}
  110 |    await expect(page.locator('.demo-code strong')).toBeVisible();await screen(page,language,'patient-otp');
  111 |    await page.getByLabel(t(language,'code'),{exact:false}).fill(await page.locator('.demo-code strong').innerText());await page.getByRole('button',{name:t(language,'verify'),exact:true}).click();
  112 |    await expect(page.locator('.app-shell')).toBeVisible();await screen(page,language,'patient-overview');await sizes(page,language,'patient-portal-responsive');
  113 |    await page.getByRole('button',{name:t(language,'book'),exact:true}).click();await screen(page,language,'patient-booking-form');await sizes(page,language,'patient-booking-responsive');await dismiss(page);
  114 |    for(const key of ['appointments','queue','laboratory','settings']){await nav(page,language,key);await screen(page,language,`patient-${key}`);}
  115 |    await nav(page,language,'records');await page.locator('.tabs').getByRole('button',{name:t(language,'prescriptions'),exact:true}).click();await page.locator('.record-row').first().click();
  116 |    await expect(page.locator('.print-document')).toBeVisible();await screen(page,language,'patient-prescription');await sizes(page,language,'patient-prescription-responsive');await dismiss(page);
  117 |    await page.setViewportSize({width:390,height:844});for(const next of ['en','ta','te',language]){await switchTo(page,next);await expect(page.locator('.main-content')).toBeVisible();}
  118 |    await page.reload();await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.locator('.app-shell')).toBeVisible();await logout(page,language);expect(errors).toEqual([]);
  119 |   });
  120 |  });
  121 | }
  122 | 
```