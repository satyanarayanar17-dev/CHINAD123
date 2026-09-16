# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: localization.spec.ts >> Telugu >> doctor consultation, prescription fields and record versions
- Location: tests/localization.spec.ts:90:3

# Error details

```
Error: te doctor-consultation-responsive document overflow at 320px; [{"tag":"DIV","classes":"topbar-actions","right":333,"width":196,"text":"Englishதமிழ்తెలుగు6"}]

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 321
Received:    333
```

```
Test timeout of 180000ms exceeded.
```

```
Error: locator.click: Test ended.
Call log:
  - waiting for locator('.clinical-editor nav').getByRole('button', { name: 'మందులు', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - link "ప్రధాన విషయానికి వెళ్లండి" [ref=e4] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e5]:
    - generic [ref=e11]:
      - strong [ref=e12]: చెట్టినాడ్ కేర్
      - generic [ref=e13]: అనుసంధానిత ఓపీడీ
    - generic [ref=e14]:
      - generic [ref=e15]: ✚
      - generic [ref=e16]:
        - generic [ref=e17]: చెట్టినాడ్ ఆసుపత్రి మరియు పరిశోధనా సంస్థ
        - generic [ref=e18]: అనుసంధానిత ఓపీడీ
    - navigation "ప్రధాన నావిగేషన్" [ref=e19]:
      - button "అవలోకనం" [ref=e20] [cursor=pointer]
      - button "ప్రత్యక్ష క్యూలైన్" [ref=e27] [cursor=pointer]
      - button "అపాయింట్‌మెంట్లు" [ref=e32] [cursor=pointer]
      - button "ప్రయోగశాల" [ref=e36] [cursor=pointer]
      - button "ప్రొఫైల్ మరియు సెషన్లు" [ref=e40] [cursor=pointer]
    - generic [ref=e45]:
      - generic [ref=e50]:
        - generic [ref=e51]: ఒక రోగి. ఒక అనుసంధాన ప్రయాణం.
        - generic [ref=e52]: రోగులు, ఆసుపత్రి సిబ్బందికి సురక్షిత యాక్సెస్
      - button "DP Dr. Priya Raman (Demo) వైద్యుడు" [ref=e53] [cursor=pointer]:
        - generic [ref=e54]: DP
        - generic [ref=e55]:
          - generic [ref=e56]: Dr. Priya Raman (Demo)
          - generic [ref=e57]: వైద్యుడు
  - generic [ref=e61]:
    - banner [ref=e62]:
      - generic [ref=e63]:
        - generic [ref=e64]: వైద్యుడు
        - generic [ref=e67]: సంప్రదింపు
      - generic [ref=e68]:
        - combobox "భాష" [ref=e69]:
          - option "English"
          - option "தமிழ்"
          - option "తెలుగు" [selected]
        - button "నోటిఫికేషన్లు (6)" [ref=e70] [cursor=pointer]:
          - generic [ref=e74]: "6"
        - button "సైన్ అవుట్" [ref=e76] [cursor=pointer]
    - main [ref=e80]:
      - generic [ref=e81]:
        - generic [ref=e82]:
          - button "వెనుకకు" [ref=e83] [cursor=pointer]
          - generic [ref=e86]:
            - generic [ref=e87]: ముసాయిదా
            - text: · సంస్కరణ 3
        - generic [ref=e89]:
          - generic [ref=e90]: KS
          - generic [ref=e91]:
            - heading "Karthik Srinivasan (Demo)" [level=2] [ref=e92]
            - paragraph [ref=e93]: 48 సంవత్సరాలు · పురుషుడు · వైద్య రికార్డు సంఖ్య (MRN) CC-1E7009C0FE
          - generic [ref=e94]: "అలెర్జీలు: Penicillin — synthetic example"
        - generic [ref=e98]:
          - complementary [ref=e99]:
            - generic [ref=e100]:
              - heading "తాజా ప్రాథమిక పరీక్ష" [level=2] [ref=e102]
              - generic [ref=e103]:
                - generic [ref=e104]:
                  - generic [ref=e105]:
                    - generic [ref=e106]: సిస్టోలిక్ రక్తపోటు (mmHg)
                    - strong [ref=e107]: 124/78mmHg
                  - generic [ref=e108]:
                    - generic [ref=e109]: నాడి వేగం (bpm)
                    - strong [ref=e110]: 76bpm
                  - generic [ref=e111]:
                    - generic [ref=e112]: శరీర ఉష్ణోగ్రత (°C)
                    - strong [ref=e113]: 36.7°C
                  - generic [ref=e114]:
                    - generic [ref=e115]: రక్త ఆక్సిజన్ SpO₂ (%)
                    - strong [ref=e116]: 98%
                  - generic [ref=e117]:
                    - generic [ref=e118]: బరువు (kg)
                    - strong [ref=e119]: 78kg
                  - generic [ref=e120]:
                    - generic [ref=e121]: ఎత్తు (cm)
                    - strong [ref=e122]: 171cm
                  - generic [ref=e123]:
                    - generic [ref=e124]: శరీర ద్రవ్యరాశి సూచిక (BMI)
                    - strong [ref=e125]: "26.7"
                  - generic [ref=e126]:
                    - generic [ref=e127]: నొప్పి తీవ్రత (0–10)
                    - strong [ref=e128]: 1/10
                - paragraph [ref=e129]: Nurse Kavitha (Demo) · 15, సెప్టెం 2026 05:32 PM · సంస్కరణ 1
            - generic [ref=e130]:
              - heading "ప్రధాన ఫిర్యాదు" [level=2] [ref=e132]
              - paragraph [ref=e133]: Diabetes follow-up and medication review
            - generic [ref=e134]:
              - heading "గత సందర్శనలు" [level=2] [ref=e136]
              - group [ref=e137]:
                - generic "15 Sept 2026 Dr. Priya Raman (Demo)" [ref=e138] [cursor=pointer]:
                  - text: 15 Sept 2026
                  - generic [ref=e139]: Dr. Priya Raman (Demo)
            - generic [ref=e140]:
              - heading "మందుల చీటీలు" [level=2] [ref=e142]
              - generic [ref=e143]:
                - text: 15 Sept 2026
                - paragraph [ref=e144]: Metformin (Demo) 500 mg · 1 tablet (demo) · Once daily (demo)
          - generic [ref=e145]:
            - navigation "సంప్రదింపు" [ref=e146]:
              - button "సంప్రదింపు" [ref=e147] [cursor=pointer]
              - button "ప్రయోగశాల" [ref=e150] [cursor=pointer]
              - button "రోగి ప్రయాణం" [ref=e153] [cursor=pointer]
            - generic [ref=e157]:
              - generic [ref=e158]:
                - heading "సంప్రదింపు" [level=2] [ref=e160]
                - generic [ref=e161]:
                  - generic [ref=e163]:
                    - generic [ref=e164]: ప్రధాన ఫిర్యాదు
                    - textbox "ప్రధాన ఫిర్యాదు" [ref=e165]: Diabetes follow-up and medication review
                  - generic [ref=e167]:
                    - generic [ref=e168]: వైద్య చరిత్ర
                    - textbox "వైద్య చరిత్ర" [ref=e169]: "QA localization te: unchanged clinical text in the selected language interface."
                  - generic [ref=e171]:
                    - generic [ref=e172]: సంబంధిత గత వైద్య చరిత్ర
                    - textbox "సంబంధిత గత వైద్య చరిత్ర" [ref=e173]: Synthetic record of diabetes monitoring.
                  - generic [ref=e175]:
                    - generic [ref=e176]: పరీక్ష వివరాలు
                    - textbox "పరీక్ష వివరాలు" [ref=e177]: "Synthetic examination: patient alert, comfortable and attending a planned review."
                  - generic [ref=e179]:
                    - generic [ref=e180]: వైద్య అభిప్రాయం
                    - textbox "వైద్య అభిప్రాయం" [ref=e181]: Synthetic assessment for product demonstration only.
              - generic [ref=e182]:
                - heading "నిర్ధారణలు" [level=2] [ref=e184]
                - generic [ref=e185]:
                  - generic [ref=e186] [cursor=pointer]:
                    - checkbox "Blood pressure review (Demo)" [ref=e187]
                    - text: Blood pressure review (Demo)
                  - generic [ref=e188] [cursor=pointer]:
                    - checkbox "Follow-up assessment (Demo)" [ref=e189]
                    - text: Follow-up assessment (Demo)
                  - generic [ref=e190] [cursor=pointer]:
                    - checkbox "General medical review (Demo)" [ref=e191]
                    - text: General medical review (Demo)
                  - generic [ref=e192] [cursor=pointer]:
                    - checkbox "Older adult review (Demo)" [ref=e193]
                    - text: Older adult review (Demo)
                  - generic [ref=e194] [cursor=pointer]:
                    - checkbox "Paediatric review (Demo)" [ref=e195]
                    - text: Paediatric review (Demo)
                  - generic [ref=e196] [cursor=pointer]:
                    - checkbox "Type 2 diabetes follow-up (Demo)" [checked] [ref=e197]
                    - text: Type 2 diabetes follow-up (Demo)
              - generic [ref=e198]:
                - generic [ref=e199]:
                  - heading "మందులు" [level=2] [ref=e200]
                  - button "మందు జోడించండి" [ref=e201] [cursor=pointer]
                - generic [ref=e204]:
                  - generic [ref=e205]: "1"
                  - generic [ref=e206]:
                    - generic [ref=e207]:
                      - generic [ref=e208]: జాబితా నుంచి మందును ఎంచుకోండి *
                      - combobox "జాబితా నుంచి మందును ఎంచుకోండి *" [ref=e209]:
                        - option "ఒక ఎంపికను ఎంచుకోండి"
                        - option "Metformin (Demo) — 500 mg · Tablet · Oral" [selected]
                        - option "Paracetamol (Demo) — 500 mg · Tablet · Oral"
                    - generic [ref=e210]:
                      - generic [ref=e211]: మోతాదు *
                      - textbox "మోతాదు" [ref=e212]: 1 tablet (demo)
                    - generic [ref=e213]:
                      - generic [ref=e214]: ఎంత తరచుగా *
                      - textbox "ఎంత తరచుగా" [ref=e215]: Once daily (demo)
                    - generic [ref=e216]:
                      - generic [ref=e217]: వ్యవధి *
                      - textbox "వ్యవధి" [ref=e218]: 7 days (demo)
                    - generic [ref=e220]:
                      - generic [ref=e221]: సూచనలు
                      - textbox "సూచనలు" [ref=e222]: Synthetic example only. Do not use this record for treatment.
                  - button "తొలగించండి 1" [ref=e223] [cursor=pointer]
              - generic [ref=e227]:
                - heading "సలహా" [level=2] [ref=e229]
                - generic [ref=e230]:
                  - generic [ref=e231]:
                    - generic [ref=e232]: చికిత్స ప్రణాళిక
                    - textbox "చికిత్స ప్రణాళిక" [ref=e233]: Demonstration care plan recorded by the assigned demo doctor.
                  - generic [ref=e234]:
                    - generic [ref=e235]: సలహా
                    - textbox "సలహా" [ref=e236]: This is a synthetic demonstration record, not medical advice or an actual prescription.
              - generic [ref=e237]:
                - heading "తదుపరి సందర్శన" [level=2] [ref=e239]
                - generic [ref=e241]:
                  - checkbox "తదుపరి సందర్శన బుక్ చేయండి" [ref=e242]
                  - text: తదుపరి సందర్శన బుక్ చేయండి
              - generic [ref=e243]:
                - paragraph [ref=e244]: సందర్శనను పూర్తి చేస్తే సంప్రదింపు ఖరారై మందుల చీటీ జారీ అవుతుంది. తర్వాతి మార్పులకు సవరణ కారణం, సవరించిన వారి వివరాలు అవసరం.
                - generic [ref=e245]:
                  - button "డ్రాఫ్ట్ సేవ్ చేయండి" [ref=e246] [cursor=pointer]
                  - button "మందుల చీటీ జారీ చేసి పూర్తి చేయండి" [ref=e251] [cursor=pointer]
    - contentinfo [ref=e255]:
      - generic [ref=e256]:
        - text: చెట్టినాడ్ కేర్
        - generic [ref=e257]: ·
        - text: అనుసంధానిత ఓపీడీ
      - generic [ref=e258]: రోగులు, ఆసుపత్రి సిబ్బందికి సురక్షిత యాక్సెస్
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
  31  |  expect.soft(metrics.scroll,`${language} ${name} document overflow at ${metrics.width}px; ${JSON.stringify(metrics.offenders)}`).toBeLessThanOrEqual(metrics.width+1);
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
> 98  |    for(const key of ['medications','laboratory','journey']){await page.locator('.clinical-editor nav').getByRole('button',{name:t(language,key),exact:true}).click();await screen(page,language,`doctor-${key}`);if(key==='medications')await sizes(page,language,'prescription-builder-responsive');}
      |                                                                                                                                                              ^ Error: locator.click: Test ended.
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