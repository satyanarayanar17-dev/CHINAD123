export type PasswordGateStatus = 'bootstrapping' | 'authenticated' | 'unauthenticated' | 'backend_unavailable' | 'error';

export function shouldForcePasswordChange(status: PasswordGateStatus, mustChangePassword: boolean) {
  return status === 'authenticated' && mustChangePassword;
}
