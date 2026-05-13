import { getCurrentProfile } from "./localStorageAPI";

export const DAILY_GIFT_FREE_KEY = "shop_daily_gift_free_v1";
export const DAILY_GIFT_SG_KEY = "shop_daily_gift_sg_v1";

export function getTodayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isDealsDailyGiftAvailable(): boolean {
  return localStorage.getItem(DAILY_GIFT_FREE_KEY) !== getTodayStamp();
}

export function isDealsDailyGiftStarGuardianAvailable(): boolean {
  const p = getCurrentProfile();
  if (!p) return false;
  const sgActive = !!p.starGuardian && (p.starGuardian as any)?.expiresAt > Date.now();
  if (!sgActive) return false;
  return localStorage.getItem(DAILY_GIFT_SG_KEY) !== getTodayStamp();
}

export function isAnyDealsGiftAvailable(): boolean {
  return isDealsDailyGiftAvailable() || isDealsDailyGiftStarGuardianAvailable();
}

