import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const jwt = require('../backend/node_modules/jsonwebtoken');
const evidence = 'qa-evidence';
for (const directory of ['01-auth', '11-errors']) mkdirSync(`${evidence}/${directory}`, { recursive: true });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({page,context},testInfo) => {
  // Each scenario models a separate client behind the trusted local test proxy.
  const client=2+[...testInfo.title].reduce((a,c)=>a+c.charCodeAt(0),0)%200;
  await context.setExtraHTTPHeaders({'X-Forwarded-For':'203.0.113.'+client});
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(async ({page}) => { expect(runtimeErrors.get(page)).toEqual([]); });
let anotherPatientId = '';
let otherDepartmentPatientId = '';
let otherDepartmentEncounterId = '';
test.beforeAll(async ({browser}) => {
  const context = await browser.newContext({baseURL:'http://127.0.0.1:5175',extraHTTPHeaders:{'X-Forwarded-For':'203.0.113.1'}});
  const page = await context.newPage();
  const token = await staff(page,'demo_admin');
  const people = await fetchApi(page,token,'/opd/patients');
  anotherPatientId = people.body.find((p:{phone:string})=>p.phone==='+919000000001').id;
  otherDepartmentPatientId = people.body.find((p:{phone:string})=>p.phone==='+919000000003').id;
  const queue = await fetchApi(page,token,'/opd/queue');
  otherDepartmentEncounterId = queue.body.find((q:{patient_id:string})=>q.patient_id===otherDepartmentPatientId).encounter_id;
  await context.close();
});
const fixtureSigningKey = '9087a416cd21b1b746a211731b4a7099ecb073d9a16a4a44';

async function capture(page: Page, file: string) {
  await page.screenshot({ path: `${evidence}/${file}.png`, fullPage: true });
}
async function staff(page: Page, id: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
  await page.locator('input[name=username]').fill(id);
  await page.locator('input[name=password]').fill('ChettinadDemo2026!');
  const loggedIn = page.waitForResponse(r => r.url().endsWith('/auth/login/staff'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await loggedIn;
  expect(response.status()).toBe(200);
  const token = (await response.json()).access_token as string;
  await expect(page.locator('.sidebar')).toBeVisible();
  return token;
}
async function fetchApi(page: Page, token: string, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ token, path, method, body }) => {
    const response = await fetch(`/api/v1${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }, { token, path, method, body });
}
async function nav(page: Page, name: string) {
  await page.locator('.sidebar nav').getByRole('button', { name, exact: true }).click();
  await expect(page.locator('.main-content')).toBeVisible();
}

test('unauthenticated protected URLs, invalid route and accessible credential validation', async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', e => runtimeErrors.push(e.message));
  for (const path of ['/app/administration', '/app/records', '/app/not-a-real-screen']) {
    await page.goto(path);
    await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
  }
  await capture(page, '01-auth/protected-direct-url-login-pass');
  await page.getByRole('button', { name: 'Hospital staff', exact: true }).click();
  const requests: string[] = [];
  page.on('request', r => { if (r.url().endsWith('/auth/login/staff')) requests.push(r.url()); });
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect(await page.locator('input[name=username]').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(requests).toHaveLength(0);
  await page.locator('input[name=username]').fill('qa_invalid_staff');
  await page.locator('input[name=password]').fill('DeliberatelyWrong2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('incorrect');
  await capture(page, '11-errors/invalid-staff-credentials-pass');
  expect(runtimeErrors).toEqual([]);
});

test('doctor RBAC rejects administrative mutations and tampered patient IDs from browser', async ({ page }) => {
  let token = await staff(page, 'demo_doctor');
  await page.goto('/app/administration');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar nav')).not.toContainText('Administration');
  await expect(page.getByRole('heading', { name: 'Staff directory', exact: true })).toHaveCount(0);
  const restored = await fetchApi(page, '', '/auth/refresh', 'POST', {});
  token = restored.body.access_token;
  expect((await fetchApi(page, token, '/opd/staff')).status).toBe(403);
  expect((await fetchApi(page, token, '/opd/staff/demo_admin', 'PATCH', { active: false })).status).toBe(403);
  expect((await fetchApi(page, token, '/opd/patients/not-owned-id/record')).status).toBe(404);
  expect((await fetchApi(page, token, '/opd/patients/'+otherDepartmentPatientId+'/record')).status).toBe(404);
  await expect(page).toHaveURL(/\/app\/overview$/);
  const cardiology = await fetchApi(page, token, '/opd/appointments');
  expect(cardiology.body.every((appointment: { doctor_id: string }) => appointment.doctor_id === 'demo_doctor')).toBe(true);
  await capture(page, '01-auth/doctor-direct-admin-route-denied-pass');
});

test('nurse department restrictions and malicious clinical writes are denied', async ({ page }) => {
  const token = await staff(page, 'demo_nurse');
  const queue = await fetchApi(page, token, '/opd/queue');
  expect(queue.status).toBe(200);
  expect(queue.body.every((entry: { department_name: string }) => entry.department_name === 'General Medicine')).toBe(true);
  expect((await fetchApi(page, token, '/opd/staff')).status).toBe(403);
  expect((await fetchApi(page, token, '/opd/labs')).status).toBe(403);
  expect((await fetchApi(page, token, '/opd/patients/'+otherDepartmentPatientId+'/record')).status).toBe(404);
  expect((await fetchApi(page, token, '/opd/encounters/'+otherDepartmentEncounterId+'/start-triage','POST',{__v:1})).status).toBe(404);
  const encounter = queue.body[0].encounter_id;
  expect((await fetchApi(page, token, `/opd/encounters/${encounter}/complete`, 'POST', { __v: 0, data: {} })).status).toBe(403);
  await page.goto('/app/administration');
  await expect(page.locator('.sidebar nav')).not.toContainText('Administration');
  await capture(page, '01-auth/nurse-permission-boundary-pass');
});

test('patient OTP browser registration, own-record boundary and protected routes', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('9000000077');
  await page.getByRole('button', { name: 'Send verification code', exact: true }).click();
  const code = await page.locator('.demo-code strong').innerText();
  await page.getByRole('checkbox',{name:'I am a new patient'}).check();
  const values = { name: 'QA Browser Patient (Synthetic)', dob: '1988-01-15', address: 'QA Synthetic Address', city: 'Chennai', state: 'Tamil Nadu', pin_code: '603103', emergency_contact: '9000000099' };
  for (const [name, value] of Object.entries(values)) await page.locator(`[name="${name}"]`).fill(value);
  await page.getByLabel('Verification code').fill(code);
  const loggedIn = page.waitForResponse(r => r.url().endsWith('/otp/verify'));
  await page.getByRole('button', { name: 'Verify & continue', exact: true }).click();
  const login = await loggedIn; expect(login.status()).toBe(200);
  const token = (await login.json()).access_token;
  await expect(page.locator('.sidebar')).toBeVisible();
  const own = await fetchApi(page, token, '/opd/profile');
  expect(own.body.name).toBe(values.name);
  expect((await fetchApi(page, token, `/opd/patients/${own.body.id}/record`)).status).toBe(200);
  expect((await fetchApi(page, token, '/opd/patients/someone-else/record')).status).toBe(404);
  expect((await fetchApi(page, token, '/opd/patients/'+anotherPatientId+'/record')).status).toBe(404);
  expect((await fetchApi(page, token, '/opd/patients/'+anotherPatientId+'/journey')).status).toBe(404);
  expect((await fetchApi(page, token, '/opd/staff')).status).toBe(403);
  expect((await fetchApi(page, token, '/opd/encounters/other-encounter/complete', 'POST', {})).status).toBe(403);
  await page.goto('/app/administration');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.sidebar nav')).not.toContainText('Administration');
  await expect(page.locator('.main-content')).toContainText(values.name);
  await capture(page, '01-auth/patient-registration-role-boundary-pass');
});

test('browser reload restores session; expired access rotates secret and public IDs cannot refresh', async ({ page, context }) => {
  const token = await staff(page, 'demo_admin');
  const claims = jwt.decode(token);
  const firstCookie = (await context.cookies()).find(c => c.name === 'cc_refresh_token')!;
  expect(firstCookie.httpOnly).toBe(true);expect(firstCookie.path).toBe('/api/v1/auth');
  expect(claims.sid).not.toBe(firstCookie.value);
  const publicSessions = await fetchApi(page, token, '/auth/opd/sessions');
  expect(publicSessions.body.some((s: { id: string; current: boolean }) => s.id === claims.sid && s.current)).toBe(true);
  expect((await fetchApi(page, token, '/auth/refresh', 'POST', { refresh_token: claims.sid })).status).toBe(200); // Browser cookie takes precedence; secret remains HttpOnly.
  // A separate same-origin fetch without cookies cannot use the public session ID.
  const unusable = await page.evaluate(async sid => { const r = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sid }) }); return r.status; }, claims.sid);
  expect(unusable).toBe(401);
  await page.reload();
  await expect(page.locator('.sidebar')).toBeVisible();
  const restoredCookie = (await context.cookies()).find(c => c.name === 'cc_refresh_token')!;
  expect(restoredCookie.value).not.toBe(firstCookie.value);
  const expired = jwt.sign({ id: claims.id, role: claims.role, account_type: claims.account_type, sid: claims.sid }, fixtureSigningKey, { expiresIn: -1 });
  await page.evaluate(async token => { const client = await import('/src/api/client.ts'); client.setAccessToken(token); }, expired);
  const refreshed = page.waitForResponse(r => r.url().endsWith('/auth/refresh') && r.status() === 200);
  await nav(page, 'Patients'); await refreshed;
  await expect(page.locator('.main-content')).toContainText('Ananya Raman');
  expect((await context.cookies()).find(c => c.name === 'cc_refresh_token')!.value).not.toBe(restoredCookie.value);
  await capture(page, '01-auth/expired-access-refresh-recovery-pass');
});

test('session revocation invalidates browser access and signing out survives reload', async ({ page, context }) => {
  const token = await staff(page, 'demo_cardio_nurse');
  const sid = jwt.decode(token).sid;
  expect((await fetchApi(page, token, `/auth/opd/sessions/${sid}`, 'DELETE')).status).toBe(200);
  expect((await fetchApi(page, token, '/opd/queue')).status).toBe(401);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await capture(page, '01-auth/revoked-session-login-pass');
  await staff(page, 'demo_paeds_nurse');
  const logout = page.waitForResponse(r => r.url().endsWith('/auth/logout'));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  expect((await logout).status()).toBe(200);
  expect((await context.cookies()).some(c => c.name === 'cc_refresh_token')).toBe(false);
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
  await capture(page, '01-auth/logout-reload-pass');
});

test('network interruption is visible and retry restores service', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', route => route.abort('failed'));
  await page.goto('/app/overview');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await capture(page, '11-errors/backend-unavailable-visible-retry-pass');
  await page.unroute('**/api/v1/auth/refresh');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
  await capture(page, '11-errors/backend-recovery-after-retry-pass');
});

test('logout during network failure cannot silently restore a session on reload', async ({ page }) => {
  await staff(page, 'demo_paediatrician');
  await page.route('**/api/v1/auth/logout', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
  await capture(page, '11-errors/offline-logout-login-state');
  await page.unroute('**/api/v1/auth/logout');
  await page.reload();
  await page.waitForLoadState('networkidle');
  if (await page.locator('.sidebar').count()) await capture(page, '11-errors/before-fix-offline-logout-restores-session');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hospital staff', exact: true })).toBeVisible();
  await capture(page, '11-errors/after-fix-offline-logout-stays-signed-out');
});

test('admin access is operational only; bearer and refresh secrets stay out of UI storage', async ({page,context})=>{
  const token=await staff(page,'demo_admin');
  expect((await fetchApi(page,token,'/opd/staff')).status).toBe(200);
  expect((await fetchApi(page,token,'/opd/patients/'+anotherPatientId+'/record')).status).toBe(403);
  expect((await fetchApi(page,token,'/opd/encounters/'+otherDepartmentEncounterId+'/complete','POST',{})).status).toBe(403);
  const cookie=(await context.cookies()).find(c=>c.name==='cc_refresh_token')!;
  const rendered=await page.locator('body').innerText();
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},cookie:document.cookie}));
  for(const secret of [token,cookie.value,fixtureSigningKey]){
    expect(rendered).not.toContain(secret);expect(storage).not.toContain(secret);
  }
  await nav(page,'Audit trail');
  await expect(page.locator('.main-content')).toContainText('demo_admin');
  const audit=await fetchApi(page,token,'/opd/audit');
  const login=audit.body.find((r:{actor_id:string;action:string})=>r.actor_id==='demo_admin'&&r.action==='SYS_AUTH_LOGIN:ADMIN');
  expect(login).toBeTruthy();
  const utc=String(login.timestamp).replace(' ','T')+(String(login.timestamp).includes('T')?'':'Z');
  const time=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(utc));
  await expect(page.locator('.main-content')).toContainText(time);
  await capture(page,'01-auth/admin-clinical-restriction-and-audit-pass');
});

test('logout clears other open browser tabs and prevents late refresh from restoring access',async({page,context})=>{
  const token=await staff(page,'demo_doctor');
  const second=await context.newPage();await second.goto('/app/overview');
  await expect(second.locator('.sidebar')).toBeVisible();
  const claims=jwt.decode(token);
  const expired=jwt.sign({id:claims.id,role:claims.role,account_type:claims.account_type,sid:claims.sid},fixtureSigningKey,{expiresIn:-1});
  let release!:()=>void;let observed!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const entered=new Promise<void>(resolve=>{observed=resolve;});
  await page.route('**/api/v1/auth/refresh',async route=>{
    const response=await route.fetch();observed();await gate;await route.fulfill({response});
  });
  const request=page.evaluate(async expired=>{
    const client=await import('/src/api/client.ts');client.setAccessToken(expired);
    try{await client.api.get('/opd/queue');return 'unexpected-success';}catch{return 'rejected';}
  },expired);
  await entered;
  const loggedOut=page.waitForResponse(r=>r.url().endsWith('/auth/logout'));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(second.locator('.sidebar')).toHaveCount(0);
  release();
  expect(await request).toBe('rejected');
  expect((await loggedOut).status()).toBe(200);
  expect(await page.evaluate(async()=> (await import('/src/api/client.ts')).getAccessToken())).toBeNull();
  await page.unroute('**/api/v1/auth/refresh');
  await page.reload();await expect(page.getByRole('button',{name:'Hospital staff',exact:true})).toBeVisible();
  await capture(page,'01-auth/multitab-and-inflight-refresh-logout-pass');
  await second.close();
});

test('server logout failure stays visible, cannot auto-restore, and retry allows an explicit new login',async({page})=>{
  await staff(page,'demo_doctor');
  await page.route('**/api/v1/auth/logout',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'LOGOUT_FAILED'}})}));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Server sign-out is pending');
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Server sign-out is pending');
  await capture(page,'11-errors/server-logout-failure-visible-pass');
  await page.unroute('**/api/v1/auth/logout');
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await staff(page,'demo_nurse');
  await expect(page).toHaveURL(/\/app\/queue$/);
  await capture(page,'01-auth/explicit-login-after-logout-retry-pass');
});

test('missing refresh credential expires browser session without a reload loop',async({page,context})=>{
  await staff(page,'demo_nurse');
  await context.clearCookies();
  const requests:string[]=[];
  page.on('request',r=>{if(r.url().endsWith('/auth/refresh'))requests.push(r.url());});
  await page.reload();
  await expect(page.getByRole('button',{name:'Hospital staff',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect(requests.length).toBe(1);
  await capture(page,'01-auth/expired-refresh-login-pass');
});

test('patient OTP resend cooldown and invalid-attempt lockout are enforced',async({page})=>{
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill('9000000078');
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  const code=await page.locator('.demo-code strong').innerText();
  await page.getByRole('button',{name:'Send verification code',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('Verification code').fill('000000');
  await page.getByRole('button',{name:'Verify & continue',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('code');
  await capture(page,'11-errors/invalid-otp-visible-pass');
  for(let i=0;i<4;i++)expect((await fetchApi(page,'','/auth/opd/otp/verify','POST',{phone:'9000000078',code:'000000'})).status).toBe(401);
  expect((await fetchApi(page,'','/auth/opd/otp/verify','POST',{phone:'9000000078',code})).status).toBe(401);
  await expect(page.locator('.sidebar')).toHaveCount(0);
});

test('invalid staff attempts hit a bounded rate limit',async({page})=>{
  await page.goto('/login');
  let limited=false;
  for(let i=0;i<12;i++){
    const result=await fetchApi(page,'','/auth/login/staff','POST',{username:'qa_rate_limit_only',password:'InvalidOnly2026!'});
    if(result.status===429){expect(result.body.error.code).toBe('RATE_LIMITED');limited=true;break;}
    expect(result.status).toBe(401);
  }
  expect(limited).toBe(true);
  await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
  await page.locator('[name=username]').fill('qa_rate_limit_only');
  await page.locator('[name=password]').fill('InvalidOnly2026!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page,'11-errors/staff-login-rate-limit-pass');
});

test('spoofing the untrusted forwarded address cannot evade the client IP login limit',async({page,context})=>{
  await page.goto('/login');
  let limited=false;
  for(let i=0;i<12;i++){
    // The proxy appends the real client address to any untrusted incoming chain.
    await context.setExtraHTTPHeaders({'X-Forwarded-For':`198.51.100.${i+1}, 203.0.113.240`});
    const result=await fetchApi(page,'','/auth/login/staff','POST',{username:`qa_spoof_${i}`,password:'InvalidOnly2026!'});
    if(result.status===429){expect(result.body.error.code).toBe('RATE_LIMITED');limited=true;break;}
    expect(result.status).toBe(401);
  }
  expect(limited).toBe(true);
  await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
  await page.locator('[name=username]').fill('qa_spoof_final');
  await page.locator('[name=password]').fill('InvalidOnly2026!');
  const response=page.waitForResponse(r=>r.url().endsWith('/auth/login/staff'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  expect((await response).status()).toBe(429);
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page,'11-errors/forwarded-address-rate-limit-pass');
});

test('new staff must change password and deactivation immediately revokes access',async({page,browser})=>{
  const adminContext=await browser.newContext({baseURL:'http://127.0.0.1:5175',extraHTTPHeaders:{'X-Forwarded-For':'203.0.113.241'}});
  const adminPage=await adminContext.newPage();
  const adminToken=await staff(adminPage,'demo_admin');
  const username='qa_password_gate';
  const initial='InitialSynthetic2026!';
  const changed='ChangedSynthetic2026!';
  expect((await fetchApi(adminPage,adminToken,'/opd/staff','POST',{id:username,name:'QA Password Gate (Synthetic)',role:'NURSE',department:'General Medicine',password:initial})).status).toBe(201);
  await page.goto('/login');
  await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
  await page.locator('[name=username]').fill(username);
  await page.locator('[name=password]').fill(initial);
  const signedIn=page.waitForResponse(r=>r.url().endsWith('/auth/login/staff'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const response=await signedIn;expect(response.status()).toBe(200);
  const token=(await response.json()).access_token;
  await expect(page.getByRole('heading',{name:'Set a new password to continue',exact:true})).toBeVisible();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  const restricted=await fetchApi(page,token,'/opd/queue');
  expect(restricted.status).toBe(403);expect(restricted.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  await capture(page,'01-auth/first-login-password-gate-pass');
  await page.locator('[name=currentPassword]').fill(initial);
  await page.locator('[name=newPassword]').fill('weakpass');
  const weak=page.waitForResponse(r=>r.url().endsWith('/auth/change-password'));
  await page.getByRole('button',{name:'Change password',exact:true}).click();
  const weakResponse=await weak;
  if(weakResponse.status()!==400){
    await expect(page.locator('.sidebar')).toBeVisible();
    await capture(page,'11-errors/before-fix-weak-password-bypasses-gate');
  }
  expect(weakResponse.status()).toBe(400);
  expect((await weakResponse.json()).error.code).toBe('WEAK_PASSWORD');
  await expect(page.getByRole('alert')).toContainText('12');
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await capture(page,'11-errors/weak-password-rejected-pass');
  for(const candidate of ['alllowercasepassword','ALLUPPERCASE123!','NoNumberPassword!','NoSymbolPassword123','A1!'+ 'a'.repeat(70)]){
    expect((await fetchApi(page,token,'/auth/change-password','POST',{currentPassword:initial,newPassword:candidate})).status).toBe(400);
  }
  await page.locator('[name=newPassword]').fill(changed);
  await page.getByRole('button',{name:'Change password',exact:true}).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  expect((await fetchApi(page,token,'/opd/queue')).status).toBe(200);
  expect((await fetchApi(page,'','/auth/login/staff','POST',{username,password:initial})).status).toBe(401);
  expect((await fetchApi(adminPage,adminToken,'/opd/staff/'+username,'PATCH',{active:false})).status).toBe(200);
  expect((await fetchApi(page,token,'/opd/queue')).status).toBe(401);
  await page.reload();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Hospital staff',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Hospital staff',exact:true}).click();
  await page.locator('[name=username]').fill(username);
  await page.locator('[name=password]').fill(changed);
  const denied=page.waitForResponse(r=>r.url().endsWith('/auth/login/staff'));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  expect((await denied).status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await capture(page,'01-auth/deactivated-staff-login-denied-pass');
  await adminContext.close();
});

test('a delayed bootstrap session response cannot reopen a tab after another tab signs out',async({page,context})=>{
  await staff(page,'demo_cardiologist');
  const second=await context.newPage();
  const errors:string[]=[];second.on('pageerror',error=>errors.push(error.message));
  let release!:()=>void;let observed!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const entered=new Promise<void>(resolve=>{observed=resolve;});
  await second.route('**/api/v1/opd/session',async route=>{
    const response=await route.fetch();observed();await gate;await route.fulfill({response});
  });
  await second.goto('/app/overview');
  await entered;
  const loggedOut=page.waitForResponse(r=>r.url().endsWith('/auth/logout'));
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  expect((await loggedOut).status()).toBe(200);
  release();
  await second.waitForLoadState('networkidle');
  await expect(second.getByRole('button',{name:'Hospital staff',exact:true})).toBeVisible();
  await expect(second.locator('.sidebar')).toHaveCount(0);
  expect(await second.evaluate(async()=> (await import('/src/api/client.ts')).getAccessToken())).toBeNull();
  expect(errors).toEqual([]);
  await capture(second,'01-auth/delayed-bootstrap-after-other-tab-logout-pass');
  await second.close();
});
