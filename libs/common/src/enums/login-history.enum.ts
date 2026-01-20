export enum LoginStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export enum LoginFailureReason {
  INVALID_CREDENTIALS = 'invalid_credentials',
  ACCOUNT_DISABLED = 'account_disabled',
  PHONE_NOT_VERIFIED = 'phone_not_verified',
  DEVICE_BLOCKED = 'device_blocked',
  RATE_LIMITED = 'rate_limited',
  MAX_DEVICES_REACHED = 'max_devices_reached',
}
