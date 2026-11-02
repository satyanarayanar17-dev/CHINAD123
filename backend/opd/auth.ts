import { createRequire } from 'node:module';
import { randomUUID, randomInt, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db, transaction, endpoint, parse, phone, now, id, fail, actor, createPatient, audit, event } from './core.ts';
import type { Req } from './core.ts';
import type { Patient, Staff } from '../../src/opd/types.ts';
const require = createRequire(import.meta.url);
const { JWT_SECRET, requireAuth, createSessionCredentials } = require('../middleware/auth');
const { getRefreshCookieOptions, REFRESH_COOKIE_NAME } = require('../cookies');
import { demoOtp, otpHash, otpSettings, otpProvider, otpDeliveryConfigured, otpRateLimit, authLog } from './otp.ts';
export { demoOtp, sendSms } from './otp.ts';
const ttl = () => new Date(Date.now() + 30 * 86400000).toISOString();
type Otp = { hash: string; challenge_id: string; purpose: string; delivered: number; expires_at: string; sent_at: string; consumed: number; attempts: number };
export const authRouter = Router();
const purpose = (value: unknown) => { if (value !== undefined && value !== 'PATIENT_LOGIN') fail('OTP_INVALID',401); };
authRouter.get('/config', endpoint(async (_req, res) => res.json({ demo_otp: demoOtp, sms_available: otpDeliveryConfigured, doctor_registration_required: true })));
authRouter.post('/otp/request', endpoint(async (req, res) => {
  const mobile = parse(phone, req.body.phone);
  purpose(req.body.purpose);
  await otpRateLimit(mobile, req.ip || 'unknown');
  const code = String(randomInt(100000,1000000));
  const challengeId = randomUUID();
  await transaction(async tx => {
    // Create a stable row before locking, including the first concurrent request.
    await tx.run("INSERT INTO patient_otps (phone,hash,expires_at,sent_at,consumed) VALUES (?,'','1970-01-01','1970-01-01',1) ON CONFLICT(phone) DO NOTHING",[mobile]);
    const existing = await tx.get<Otp>(`SELECT * FROM patient_otps WHERE phone=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,[mobile]);
    if (Date.now()-new Date(existing!.sent_at).getTime() < otpSettings.cooldown*1000) fail('OTP_WAIT',429);
    await tx.run("UPDATE patient_otps SET hash=?,challenge_id=?,purpose='PATIENT_LOGIN',delivered=0,expires_at=?,sent_at=?,attempts=0,consumed=0 WHERE phone=?",[otpHash(mobile,challengeId,code),challengeId,new Date(Date.now()+otpSettings.ttl*1000).toISOString(),now(),mobile]);
    await audit(tx,req,'OTP_REQUESTED',null,{delivery:demoOtp?'DEVELOPMENT':'SMS'});
  });
  authLog('OTP_REQUESTED',mobile);
  try {
    await otpProvider.sendOtp({phoneNumber:mobile,otp:code,purpose:'PATIENT_LOGIN',challengeId});
    await transaction(async tx => {
      await tx.run('UPDATE patient_otps SET delivered=1 WHERE phone=? AND challenge_id=?',[mobile,challengeId]);
      await audit(tx,req,'OTP_SENT',null,{});
    });
  } catch {
    await transaction(async tx => {
      await tx.run('UPDATE patient_otps SET consumed=1 WHERE phone=? AND challenge_id=?',[mobile,challengeId]);
      await audit(tx,req,'OTP_DELIVERY_FAILED',null,{},'denied');
    });
    authLog('OTP_DELIVERY_FAILED',mobile);
    fail('SMS_DELIVERY_FAILED',503);
  }
  authLog('OTP_SENT',mobile);
  res.json({sent:true,expires_in:otpSettings.ttl,retry_after:otpSettings.cooldown,challenge_id:challengeId,...(demoOtp?{development_code:code}:{})});
}));
authRouter.post('/otp/verify', endpoint(async (req, res) => {
  const mobile = parse(phone, req.body.phone);
  purpose(req.body.purpose);
  await otpRateLimit(mobile,req.ip || 'unknown',true);
  const code = parse(z.string().regex(/^\d{6}$/), req.body.code);
  if (!demoOtp && (typeof req.body.challenge_id !== 'string' || !req.body.challenge_id)) fail('OTP_INVALID',401);
  // Invalid attempts must commit, rather than being rolled back with the response error.
  const result = await transaction(async tx => {
    const otp = await tx.get<Otp>(`SELECT * FROM patient_otps WHERE phone=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [mobile]);
    if (!otp || otp.consumed || !otp.delivered || otp.purpose !== 'PATIENT_LOGIN' || (req.body.challenge_id !== undefined && req.body.challenge_id !== otp.challenge_id) || otp.attempts >= otpSettings.attempts || new Date(otp.expires_at).getTime() <= Date.now()) return { error: 'OTP_INVALID' };
    const correct = timingSafeEqual(Buffer.from(otp.hash, 'hex'), Buffer.from(otpHash(mobile, otp.challenge_id, code), 'hex'));
    if (!correct) {
      await tx.run('UPDATE patient_otps SET attempts=attempts+1 WHERE phone=?', [mobile]);
      await audit(tx, req, 'OTP_REJECTED', null, {}, 'denied');
      return { error: 'OTP_INVALID' };
    }
    const patient = await tx.get<Patient>(`SELECT * FROM patients WHERE phone=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [mobile]);
    if (!patient) return { error: 'PATIENT_NOT_REGISTERED' };
    if (!patient.portal_access_enabled) return { error: 'PATIENT_ACCESS_DISABLED' };
    let user = await tx.get<Staff>(`SELECT * FROM users WHERE patient_id=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [patient.id]);
    if (!user) {
      const userId = id('patient-user');
      await tx.run("INSERT INTO users (id,name,role,patient_id,must_change_password,is_active) VALUES (?,?,'PATIENT',?,0,1)", [userId, patient.name, patient.id]);
      user = (await tx.get<Staff>('SELECT * FROM users WHERE id=?', [userId]))!;
    }
    if (user.role !== 'PATIENT' || !user.is_active) return { error: 'ACCOUNT_DISABLED' };
    req.user = { id: user.id, role: 'PATIENT' };
    const credentials = createSessionCredentials();
    await tx.run("INSERT INTO refresh_tokens (id,session_key,user_id,expires_at,revoked,account_type,device_name,created_at) VALUES (?,?,?,?,0,'PATIENT',?,?)", [credentials.tokenHash, credentials.sessionKey, user.id, ttl(), (req.headers['user-agent'] || '').slice(0,200), now()]);
    const consumed = await tx.run('UPDATE patient_otps SET consumed=1 WHERE phone=? AND challenge_id=? AND consumed=0', [mobile,otp.challenge_id]);
    if (!consumed.changes) fail('OTP_INVALID',401);
    await tx.run('UPDATE patients SET phone_verified_at=? WHERE id=?',[now(),patient.id]);
    await audit(tx, req, 'PATIENT_OTP_LOGIN', patient.id);
    return { user, credentials };
  });
  if (result.error) {
    authLog('OTP_VERIFY_FAILURE',mobile);
    fail(result.error, ['PATIENT_NOT_REGISTERED','PATIENT_ACCESS_DISABLED'].includes(result.error) ? 403 : 401);
  }
  authLog('OTP_VERIFY_SUCCESS',mobile);
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
