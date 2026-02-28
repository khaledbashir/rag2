/**
 * Platform Owner gate — vendor-level access control.
 * Set PLATFORM_OWNER_EMAIL in env to your email.
 * This is NOT an ANC role — it's the platform operator's backdoor.
 */

const FALLBACK_EMAIL = "ahmad@assisted.vip";

export function getPlatformOwnerEmail(): string {
  return process.env.PLATFORM_OWNER_EMAIL || FALLBACK_EMAIL;
}

export function isPlatformOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === getPlatformOwnerEmail().toLowerCase();
}
