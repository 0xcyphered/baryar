// Shared label, color, and format helpers extracted from screen files.
// Move-only refactor (plan 034): every value is byte-identical to its source.

import { COLORS } from '../theme';
import type { AppRole } from '../types';

// ─── App experience modes (plan 040) ─────────────────────────────
// Presentation-layer only — backend roles are never mutated from here.
export const ROLE_META: Record<
  AppRole,
  { label: string; tagline: string; icon: string; color: string; tint: string }
> = {
  user: {
    label: 'کاربر',
    tagline: 'ارسال درخواست حمل و پیگیری مرسولات',
    icon: 'person-outline',
    color: COLORS.blue,
    tint: 'rgba(59, 130, 246, 0.12)',
  },
  cargo_owner: {
    label: 'صاحب کالا',
    tagline: 'ثبت بار، دریافت پیشنهاد و انتخاب شرکت حمل',
    icon: 'cube-outline',
    color: COLORS.green,
    tint: 'rgba(34, 197, 94, 0.12)',
  },
  driver: {
    label: 'راننده',
    tagline: 'یافتن بار و مدیریت سفرهای حمل',
    icon: 'car-sport-outline',
    color: COLORS.red,
    tint: 'rgba(239, 68, 68, 0.12)',
  },
};

export const APP_ROLE_ORDER: readonly AppRole[] = ['user', 'cargo_owner', 'driver'];

export const ACTIVE_ROLE_LABEL: Record<AppRole, string> = {
  user: 'حالت کاربر',
  cargo_owner: 'حالت صاحب کالا',
  driver: 'حالت رانندگی',
};

// ─── Cargo status ────────────────────────────────────────────────
export const CARGO_STATUS_COLORS: Record<string, string> = {
  draft: '#9ca3af',
  open: '#3b82f6',
  matched: '#22c55e',
  cancelled: '#ef4444',
  completed: '#22c55e',
};

export const CARGO_STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  open: 'باز',
  matched: 'تطبیق‌یافته',
  cancelled: 'لغو‌شده',
  completed: 'تکمیل‌شده',
};

// ─── Transport mode ──────────────────────────────────────────────
export const MODE_LABELS: Record<string, string> = {
  land: 'زمینی',
  sea: 'دریایی',
  air: 'هوایی',
  rail: 'ریلی',
  multimodal: 'چندوجهی',
};

// ─── Cargo special characteristics ───────────────────────────────
export const SPECIAL_LABELS: Record<string, string> = {
  hazardous: 'خطرناک',
  fragile: 'شکننده',
  refrigerated: 'یخچالی',
  livestock: 'دام',
  oversized: 'بزرگ',
  other: 'دیگر',
};

// ─── Cargo create/edit error copy ────────────────────────────────
export const CARGO_ERROR_COPY: Record<string, string> = {
  cargo_limit: 'به سقف بارهای فعال مجاز رسیده‌اید. بارهای قدیمی را لغو کنید.',
  validation_error: 'اطلاعات بار کامل نیست.',
  unauthorized: 'برای ادامه دوباره وارد شوید.',
};

// ─── Shipment status ─────────────────────────────────────────────
export const SHIPMENT_STATUS_COLORS: Record<string, string> = {
  assigned: '#f59e0b',
  loading: '#3b82f6',
  in_transit: '#3b82f6',
  at_customs: '#f59e0b',
  delivered: '#22c55e',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  assigned: 'تخصیص‌یافته',
  loading: 'در حال بارگیری',
  in_transit: 'در حال حمل',
  at_customs: 'در گمرک',
  delivered: 'تحویل‌شده',
  completed: 'تکمیل‌شده',
  cancelled: 'لغو‌شده',
};

// ─── Shipment events ─────────────────────────────────────────────
export const EVENT_TYPE_LABELS: Record<string, string> = {
  status_change: 'تغییر وضعیت',
  cargo_loaded: 'بارگیری',
  driver_departed: 'حرکت راننده',
  checkpoint: 'نقطه کنترل',
  customs_stop: 'توقف گمرک',
  note: 'یادداشت',
};

export const EVENT_ICONS: Record<string, string> = {
  status_change: 'swap-horizontal-outline',
  cargo_loaded: 'cube-outline',
  driver_departed: 'car-outline',
  checkpoint: 'location-outline',
  customs_stop: 'shield-checkmark-outline',
  note: 'document-text-outline',
};

// ─── Driver documents ────────────────────────────────────────────
export const KIND_LABELS: Record<string, string> = {
  driving_license: 'گواهینامه رانندگی',
  vehicle_registration: 'سند وسیله نقلیه',
  safety_card: 'کارت معاینه فنی',
  national_id: 'کارت ملی',
  professional_card: 'کارت حرفه‌ای',
  other: 'سایر',
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'پذیرش‌شده',
  rejected: 'ردشده',
};

export const DOC_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
};

// ─── Offer status ────────────────────────────────────────────────
export const OFFER_STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  accepted: 'پذیرفته‌شده',
  rejected: 'ردشده',
  withdrawn: 'لغوشده',
};

export const OFFER_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  accepted: '#22c55e',
  rejected: '#ef4444',
  withdrawn: '#9ca3af',
};

// ─── Format helpers ──────────────────────────────────────────────
export function formatId(id: string): string {
  return id.slice(0, 8) + '...';
}

export function formatCoord(place: { address: string; location: { coordinates: [number, number] } }): string {
  if (place.address) return place.address;
  const [lng, lat] = place.location.coordinates;
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
