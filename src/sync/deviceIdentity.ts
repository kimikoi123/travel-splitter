// Persistent device identity stored in localStorage. One vault, one device
// key per device. Losing localStorage on every device = losing the vault,
// which is the accepted trade-off of the anonymous-vault model.

const STORAGE_KEY = 'finverse.identity';
const PULL_WATERMARK_KEY = 'finverse.lastPulledAt';

export interface DeviceIdentity {
  vaultId: string;
  deviceId: string;
  deviceKey: string;
}

export function getIdentity(): DeviceIdentity | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
    if (!parsed.vaultId || !parsed.deviceId || !parsed.deviceKey) return null;
    return { vaultId: parsed.vaultId, deviceId: parsed.deviceId, deviceKey: parsed.deviceKey };
  } catch {
    return null;
  }
}

export function setIdentity(identity: DeviceIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearIdentity(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(PULL_WATERMARK_KEY);
}

export function hasIdentity(): boolean {
  return getIdentity() !== null;
}

// The "last pulled at" watermark is the next `since` value sent with
// POST /api/sync/pull. Lives alongside the identity because wiping the
// identity (revocation / sign-out) should also wipe the watermark so a
// fresh pairing starts from zero.
export function getLastPulledAt(): number {
  const raw = localStorage.getItem(PULL_WATERMARK_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function setLastPulledAt(value: number): void {
  localStorage.setItem(PULL_WATERMARK_KEY, String(value));
}

export function bearerToken(identity: DeviceIdentity): string {
  return `${identity.vaultId}.${identity.deviceId}.${identity.deviceKey}`;
}
