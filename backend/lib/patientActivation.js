const bcrypt = require('bcryptjs');
const { generateNumericOTP } = require('./clinicalIntegrity');

const ACTIVATION_TOKEN_TTL_MS = 20 * 60 * 1000;
const ACTIVATION_PLACEHOLDER = '__REDACTED__';
const ACTIVATION_BCRYPT_COST = 10;

function resolveActivationDeliveryMode() {
  return process.env.ACTIVATION_OTP_DELIVERY ||
    (process.env.NODE_ENV === 'production' ? 'console' : 'api_response');
}

function buildActivationEnvelope(code, expiresAt) {
  const deliveryMode = resolveActivationDeliveryMode();
  const activation = {
    expires_at: expiresAt,
    delivery_mode: deliveryMode
  };

  if (deliveryMode === 'api_response') {
    activation.activation_code = code;
  }

  return activation;
}

async function issuePatientActivationToken(context, patientId) {
  const activationCode = generateNumericOTP(6);
  const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS).toISOString();
  const otpHash = await bcrypt.hash(activationCode, ACTIVATION_BCRYPT_COST);

  await context.run(`DELETE FROM patient_activation_tokens WHERE patient_id = ?`, [patientId]);
  await context.run(
    `INSERT INTO patient_activation_tokens (patient_id, otp, otp_hash, expires_at, created_at, consumed_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)`,
    [patientId, ACTIVATION_PLACEHOLDER, otpHash, expiresAt]
  );

  return {
    activationCode,
    expiresAt,
    activation: buildActivationEnvelope(activationCode, expiresAt)
  };
}

async function verifyActivationCode(tokenRecord, otp) {
  if (!tokenRecord || !otp) {
    return false;
  }

  if (tokenRecord.otp_hash) {
    return bcrypt.compare(String(otp), tokenRecord.otp_hash);
  }

  return tokenRecord.otp === String(otp);
}

module.exports = {
  issuePatientActivationToken,
  verifyActivationCode,
  resolveActivationDeliveryMode,
  ACTIVATION_PLACEHOLDER
};
