import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
import { transaction, fail } from './core.ts';
const require = createRequire(import.meta.url);
const { runtimeConfig } = require('../config');
const { JWT_SECRET } = require('../middleware/auth');
const { logEvent } = require('../lib/logger');
export const authLog = (event: string, mobile: string, context: Record<string,string> = {}) =>
  logEvent('info',event,{...context,phone:`******${mobile.slice(-4)}`});
export const otpProviderName = runtimeConfig.otpDeliveryProvider || 'unconfigured';
export const demoOtp = otpProviderName === 'development' && runtimeConfig.opdDemoOtp && !runtimeConfig.isProduction && !runtimeConfig.isPilot;
if (runtimeConfig.opdDemoOtp && (runtimeConfig.isProduction || runtimeConfig.isPilot)) throw new Error('Demo OTP forbidden');
function setting(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
}
export const otpSettings = {
  ttl: setting('OTP_TTL_SECONDS', 300), cooldown: setting('OTP_COOLDOWN_SECONDS', 60),
  attempts: setting('OTP_MAX_ATTEMPTS', 5), phoneShort: setting('OTP_PHONE_15M_LIMIT', 5),
  phoneLong: setting('OTP_PHONE_HOURLY_LIMIT', 10), ipSend: setting('OTP_IP_15M_LIMIT', 20),
  ipVerify: setting('OTP_IP_VERIFY_15M_LIMIT', 20),
};
export const otpHash = (mobile: string, challenge: string, code: string) => createHmac('sha256', JWT_SECRET)
  .update(JSON.stringify(['PATIENT_LOGIN', mobile, challenge, code])).digest('hex');
export interface OtpDeliveryProvider {
  readonly name: 'development' | 'webhook' | 'msg91' | 'unconfigured';
  sendOtp(input: { phoneNumber: string; otp: string; purpose: 'PATIENT_LOGIN'; challengeId: string }): Promise<void>;
}
type DeliveryInput = Parameters<OtpDeliveryProvider['sendOtp']>[0];
type Fetch = typeof globalThis.fetch;
type OtpProviderConfig = {
  otpDeliveryProvider?: string;
  opdDemoOtp?: boolean;
  isProduction?: boolean;
  isPilot?: boolean;
  smsWebhookUrl?: string;
  smsWebhookToken?: string;
  msg91AuthKey?: string;
  msg91TemplateId?: string;
  msg91OtpVariable?: string;
};
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow';
function deliveryError(code: 'SMS_NOT_CONFIGURED' | 'SMS_DELIVERY_FAILED'): never {
  const error = new Error(code) as Error & { code: string };
  error.code = code;
  throw error;
}
export async function sendSms(mobile: string, template: string, variables: Record<string,string>, challengeId?: string) {
  let url: URL;
  try { url = new URL(process.env.SMS_WEBHOOK_URL || ''); } catch { return fail('SMS_NOT_CONFIGURED',503); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !process.env.SMS_WEBHOOK_TOKEN) fail('SMS_NOT_CONFIGURED',503);
  try {
    const response = await fetch(url, { method:'POST', redirect:'error', headers:{'Content-Type':'application/json', Authorization:`Bearer ${process.env.SMS_WEBHOOK_TOKEN}`},
      body:JSON.stringify({phone:mobile,template,variables,...(challengeId ? {challenge_id:challengeId} : {})}),signal:AbortSignal.timeout(10000) });
    if (!response.ok) fail('SMS_DELIVERY_FAILED',503);
  } catch { fail('SMS_DELIVERY_FAILED',503); }
}

export function msg91PhoneNumber(phoneNumber: string) {
  if (!/^\+91[6-9]\d{9}$/.test(phoneNumber)) deliveryError('SMS_DELIVERY_FAILED');
  return phoneNumber.slice(1);
}

export class Msg91OtpProvider implements OtpDeliveryProvider {
  readonly name = 'msg91' as const;
  private readonly config: OtpProviderConfig;
  private readonly fetchImpl: Fetch;
  constructor(config: OtpProviderConfig, fetchImpl: Fetch = (...args) => globalThis.fetch(...args)) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }
  async sendOtp({phoneNumber,otp,challengeId}: DeliveryInput) {
    const authKey = this.config.msg91AuthKey;
    const templateId = this.config.msg91TemplateId;
    const otpVariable = this.config.msg91OtpVariable;
    if (!authKey || !templateId || !otpVariable || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(otpVariable) || ['mobiles','template_id'].includes(otpVariable.toLowerCase())) {
      deliveryError('SMS_NOT_CONFIGURED');
    }
    const mobile = msg91PhoneNumber(phoneNumber);
    authLog('OTP_DELIVERY_REQUESTED',phoneNumber,{provider:'MSG91',challenge:challengeId});
    try {
      const response = await this.fetchImpl(MSG91_FLOW_URL, {
        method:'POST',
        redirect:'error',
        headers:{accept:'application/json',authkey:authKey,'content-type':'application/json'},
        body:JSON.stringify({template_id:templateId,short_url:'0',recipients:[{mobiles:mobile,[otpVariable]:otp}]}),
        signal:AbortSignal.timeout(10000),
      });
      let payload: unknown;
      try { payload = JSON.parse(await response.text()); } catch { deliveryError('SMS_DELIVERY_FAILED'); }
      const result = payload as { type?: unknown; message?: unknown };
      if (!response.ok || result?.type !== 'success' || typeof result.message !== 'string' || !result.message.trim()) {
        deliveryError('SMS_DELIVERY_FAILED');
      }
      authLog('OTP_DELIVERY_ACCEPTED',phoneNumber,{provider:'MSG91',challenge:challengeId});
    } catch {
      authLog('OTP_DELIVERY_FAILED',phoneNumber,{provider:'MSG91',challenge:challengeId});
      deliveryError('SMS_DELIVERY_FAILED');
    }
  }
}

export function createOtpDeliveryProvider(config: OtpProviderConfig = runtimeConfig, fetchImpl?: Fetch): OtpDeliveryProvider {
  if (config.otpDeliveryProvider === 'development' && config.opdDemoOtp && !config.isProduction && !config.isPilot) return {
    name:'development',
    async sendOtp() { /* Explicit local/test delivery is returned only by the guarded route. */ },
  };
  if (config.otpDeliveryProvider === 'webhook') return {
    name:'webhook',
    async sendOtp({phoneNumber,otp,purpose,challengeId}) {
      await sendSms(phoneNumber,purpose === 'PATIENT_LOGIN' ? 'PATIENT_LOGIN_OTP' : purpose,{code:otp,expires_minutes:String(otpSettings.ttl/60)},challengeId);
    },
  };
  if (config.otpDeliveryProvider === 'msg91') return new Msg91OtpProvider(config,fetchImpl);
  return { name:'unconfigured', async sendOtp() { deliveryError('SMS_NOT_CONFIGURED'); } };
}

export const otpProvider = createOtpDeliveryProvider();
export const otpDeliveryConfigured = otpProvider.name !== 'unconfigured';
// Shared durable sliding windows. Sorted locks serialize overlapping buckets across workers.
export async function otpRateLimit(phone: string, ip: string, verify = false) {
  const limits: [string,number,number][] = verify
    ? [[`verify:${ip}`,900000,otpSettings.ipVerify]]
    : [[`phone:${phone}`,900000,otpSettings.phoneShort],[`phone:${phone}`,3600000,otpSettings.phoneLong],[`send:${ip}`,900000,otpSettings.ipSend]];
  const denied = await transaction(async tx => {
    const time = Date.now();
    const records = new Map<string,number[]>();
    for (const raw of [...new Set(limits.map(l=>l[0]))].sort()) {
      const key = createHmac('sha256',JWT_SECRET).update(`otp-rate:${raw}`).digest('hex');
      await tx.run("INSERT INTO otp_rate_buckets (key,events) VALUES (?,'[]') ON CONFLICT(key) DO NOTHING",[key]);
      const row = await tx.get<{events:string}>(`SELECT events FROM otp_rate_buckets WHERE key=?${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`,[key]);
      records.set(raw,JSON.parse(row!.events).filter((t:number)=>t>time-3600000));
    }
    if (limits.some(([key,window,max])=>records.get(key)!.filter(t=>t>time-window).length>=max)) return true;
    for (const [raw,events] of records) {
      const key = createHmac('sha256',JWT_SECRET).update(`otp-rate:${raw}`).digest('hex');
      await tx.run('UPDATE otp_rate_buckets SET events=? WHERE key=?',[JSON.stringify([...events,time]),key]);
    }
    return false;
  });
  if (denied) { authLog('OTP_RATE_LIMITED',phone); fail('RATE_LIMITED',429); }
}
