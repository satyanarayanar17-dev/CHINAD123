import { createRequire } from 'node:module';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, transaction, endpoint, parse, phone, now, id, fail, actor, createPatient, audit, event } from './core.ts';
import type { Req } from './core.ts';
import type { Patient, Staff } from '../../src/opd/types.ts';
const require = createRequire(import.meta.url);
const { JWT_SECRET, requireAuth, createSessionCredentials } = require('../middleware/auth');
const { getRefreshCookieOptions, REFRESH_COOKIE_NAME } = require('../cookies');
const { createRateLimiter } = require('../middleware/rateLimit');
const { runtimeConfig } = require('../config');
const locked = runtimeConfig.isPilot || runtimeConfig.isProduction; // Note: isStaging is checked in config.js
export const demoOtp = runtimeConfig.opdDemoOtp;
const hash = (mobile: string, code: string) => createHmac('sha256', JWT_SECRET).update(`${mobile}:${code}`).digest('hex');
const ttl = () => new Date(Date.now() + 30 * 86400000).toISOString();
type Otp = { hash: string; expires_at: string; sent_at: string; consumed: number; attempts: number };
export const authRouter = Router();

// A production adapter receives phone, template and variables over authenticated HTTPS.
// The adapter is responsible for the hospital's approved SMS templates and delivery receipts.
export async function sendSms(mobile: string, template: string, variables: Record<string, string>) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url || !url.startsWith('https://') || !process.env.SMS_WEBHOOK_TOKEN) fail('SMS_NOT_CONFIGURED', 503);
  const response = await fetch(url!, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` }, body: JSON.stringify({ phone: mobile, template, variables }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) fail('SMS_DELIVERY_FAILED', 503);
}
authRouter.get('/config', endpoint(async (_req, res) => res.json({ demo_otp: demoOtp, sms_available: Boolean(process.env.SMS_WEBHOOK_URL && process.env.SMS_WEBHOOK_TOKEN) })));
authRouter.post('/otp/request', createRateLimiter({ max: 8, windowMs: 900000, keyFn: (req: Req) => [`opd-otp-ip:${req.ip}`, `opd-otp-phone:${String(req.body.phone).replace(/\D/g,'').slice(-10)}`] }), endpoint(async (req, res) => {
  const mobile = parse(phone, req.body.phone);
  if (!demoOtp && (!process.env.SMS_WEBHOOK_URL || !process.env.SMS_WEBHOOK_TOKEN)) fail('SMS_NOT_CONFIGURED', 503);
  const code = String(randomInt(100000, 1000000));
  await transaction(async tx => {
    const existing = await tx.get<Otp>('SELECT * FROM patient_otps WHERE phone=?', [mobile]);
    if (existing && Date.now() - new Date(existing.sent_at).getTime() < 60000) fail('OTP_WAIT', 429);
    await tx.run('INSERT INTO patient_otps (phone,hash,expires_at,sent_at,attempts,consumed) VALUES (?,?,?,?,0,0) ON CONFLICT(phone) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0,consumed=0', [mobile, hash(mobile,code), new Date(Date.now()+300000).toISOString(), now()]);
    await audit(tx, req, 'OTP_REQUESTED', null, { delivery: demoOtp ? 'DEVELOPMENT' : 'SMS' });
  });
  if (!demoOtp) {
    try { await sendSms(mobile, 'PATIENT_LOGIN_OTP', { code, expires_minutes: '5' }); }
    catch (error) { await db.run('UPDATE patient_otps SET consumed=1 WHERE phone=? AND hash=?', [mobile,hash(mobile,code)]); throw error; }
  }
  res.json({ sent: true, expires_in: 300, ...(demoOtp ? { development_code: code } : {}) });
}));
authRouter.post('/otp/verify', createRateLimiter({ max: 20, windowMs: 900000, keyFn: (req: Req) => `opd-verify:${req.ip}` }), endpoint(async (req, res) => {
  const mobile = parse(phone, req.body.phone);
  const code = parse(z.string().regex(/^\d{6}$/), req.body.code);
  // Invalid attempts must commit, rather than being rolled back with the response error.
  const result = await transaction(async tx => {
    const otp = await tx.get<Otp>(`SELECT * FROM patient_otps WHERE phone=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [mobile]);
    if (!otp || otp.consumed || otp.attempts >= 5 || new Date(otp.expires_at).getTime() <= Date.now()) return { error: 'OTP_INVALID' };
    const correct = timingSafeEqual(Buffer.from(otp.hash, 'hex'), Buffer.from(hash(mobile, code), 'hex'));
    if (!correct) {
      await tx.run('UPDATE patient_otps SET attempts=attempts+1 WHERE phone=?', [mobile]);
      await audit(tx, req, 'OTP_REJECTED', null, {}, 'denied');
      return { error: 'OTP_INVALID' };
    }
    let patient = await tx.get<Patient>('SELECT * FROM patients WHERE phone=?', [mobile]);
    const isNewPatient = !patient;
    if (!patient) {
      if (!req.body.profile) return { error: 'PROFILE_REQUIRED' };
      patient = await createPatient(tx, req, { ...req.body.profile, phone: mobile });
    }
    let user = await tx.get<Staff>(`SELECT * FROM users WHERE patient_id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [patient.id]);
    if (!user) {
      const userId = id('patient-user');
      await tx.run("INSERT INTO users (id,name,role,patient_id,must_change_password,is_active) VALUES (?,?,'PATIENT',?,0,1)", [userId, patient.name, patient.id]);
      user = (await tx.get<Staff>('SELECT * FROM users WHERE id=?', [userId]))!;
    }
    if (user.role !== 'PATIENT' || !user.is_active) return { error: 'ACCOUNT_DISABLED' };
    req.user = { id: user.id, role: 'PATIENT' };
    if (isNewPatient) await event(tx, req, patient.id, 'PATIENT_REGISTERED', { mrn: patient.mrn });
    const credentials = createSessionCredentials();
    await tx.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type,device_name,created_at) VALUES (?,?,?,?,0,'PATIENT',?,?)", [credentials.tokenHash, credentials.sessionKey, user.id, ttl(), (req.headers['user-agent'] || '').slice(0,200), now()]);
    await tx.run('UPDATE patient_otps SET consumed=1 WHERE phone=?', [mobile]);
    await audit(tx, req, 'PATIENT_OTP_LOGIN', patient.id);
    return { user, credentials };
  });
  if (result.error) fail(result.error, result.error === 'PROFILE_REQUIRED' ? 422 : 401);
  const accessToken = jwt.sign({ id: result.user!.id, role: 'PATIENT', account_type: 'PATIENT', sid: result.credentials!.sessionKey, session_iat_ms: Date.now() }, JWT_SECRET, { expiresIn: '15m' });
  res.cookie(REFRESH_COOKIE_NAME, result.credentials!.secret, getRefreshCookieOptions());
  res.json({ access_token: accessToken, role: 'patient', account_type: 'patient', userId: result.user!.id, name: result.user!.name, must_change_password: false });
}));
authRouter.get('/sessions', requireAuth, endpoint(async (req,res) => {
  const sessions = await db.all<{ id: string; device_name: string; created_at: string; expires_at: string }>('SELECT session_key AS id,device_name,created_at,expires_at FROM refresh_tokens WHERE user_id=? AND revoked=0 AND expires_at>? ORDER BY expires_at DESC', [req.user.id,now()]);
  const currentSession = (req.user as Req['user'] & { sid?: string }).sid;
  res.json(sessions.map(s => ({ ...s, current: s.id === currentSession })));
}));
authRouter.delete('/sessions/:id', requireAuth, endpoint(async (req,res) => {
  await transaction(async tx => {
    // Session rotation and revocation use the same stable user lock.
    if (tx.dialect === 'postgres') await tx.get('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]);
    const changed = await tx.run('UPDATE refresh_tokens SET revoked=1 WHERE session_key=? AND user_id=?', [req.params.id,req.user.id]);
    if (!changed.changes) fail('NOT_FOUND',404);
    await audit(tx,req,'SESSION_REVOKED',null,{session_id:String(req.params.id)});
  });
  res.json({ success:true });
}));
