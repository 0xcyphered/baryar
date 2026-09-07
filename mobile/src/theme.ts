/**
 * Baryar Design System
 *
 * Single source of truth for colors, spacing, shadows, radii, and typography
 * tokens. Every screen imports from here — no ad-hoc values.
 *
 * Philosophy: warm, trustworthy, logistics- professional. Soft backgrounds
 * (warm beige), blue primary, green/red status accents, layered shadows for
 * depth. RTL-first layout.
 */

// ─── Colors ──────────────────────────────────────────────────────
export const COLORS = {
  // Primary palette
  blue: '#3b82f6',
  blueDark: '#2563eb',
  blueLight: '#60a5fa',
  blueTint: 'rgba(59, 130, 246, 0.10)',

  // Semantic status
  green: '#22c55e',
  greenDark: '#16a34a',
  greenTint: 'rgba(34, 197, 94, 0.10)',
  red: '#ef4444',
  redDark: '#dc2626',
  redTint: 'rgba(239, 68, 68, 0.10)',
  amber: '#f59e0b',
  amberTint: 'rgba(245, 158, 11, 0.10)',

  // Neutrals (warm tint)
  gray: '#9ca3af',
  grayMid: '#6b7280',
  grayDark: '#374151',
  grayLight: '#f1f5f9',
  graySurface: '#f8fafc',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',

  // Backgrounds
  bg: '#e8e4e0',
  bgWarm: '#f5f0ec',
  white: '#ffffff',

  // Text
  textDark: '#1f2937',
  textMid: '#4b5563',
  textLight: '#9ca3af',

  // Gradients (arrays for LinearGradient)
  gradientBlue: ['#3b82f6', '#2563eb'] as const,
  gradientGreen: ['#22c55e', '#16a34a'] as const,
  gradientWarm: ['#f5f0ec', '#e8e4e0'] as const,
  gradientHero: ['#3b82f6', '#1d4ed8'] as const,
} as const;

// ─── Shadows ─────────────────────────────────────────────────────
/** iOS + Android shadow presets. Pass as `style={shadows.sm}`. */
export const shadows = {
  none: {},
  xs: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 10,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────
/** 4-point grid spacing scale. Use `space[3]` = 12px etc. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

// ─── Border radii ────────────────────────────────────────────────
export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

// ─── Typography ──────────────────────────────────────────────────
/**
 * Semantic font sizes + weights. The Vazirmatn webfont family is loaded
 * via expo-font at root. Use `textStyles.body` as a style object, or
 * pick individual tokens.
 */
export const font = {
  regular: 'Vazirmatn_400Regular',
  medium: 'Vazirmatn_500Medium',
  bold: 'Vazirmatn_700Bold',
} as const;

export const textStyles = {
  hero: {
    fontSize: 28,
    fontFamily: font.bold,
    color: COLORS.textDark,
    lineHeight: 36,
  },
  h1: {
    fontSize: 22,
    fontFamily: font.bold,
    color: COLORS.textDark,
    lineHeight: 28,
  },
  h2: {
    fontSize: 18,
    fontFamily: font.bold,
    color: COLORS.textDark,
    lineHeight: 24,
  },
  h3: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontFamily: font.regular,
    color: COLORS.textDark,
    lineHeight: 22,
  },
  bodyMedium: {
    fontSize: 14,
    fontFamily: font.medium,
    color: COLORS.textDark,
    lineHeight: 22,
  },
  caption: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    lineHeight: 18,
  },
  small: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.gray,
    lineHeight: 16,
  },
  button: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.white,
    lineHeight: 22,
  },
  buttonSmall: {
    fontSize: 14,
    fontFamily: font.medium,
    color: COLORS.white,
    lineHeight: 20,
  },
  badge: {
    fontSize: 11,
    fontFamily: font.medium,
    color: COLORS.white,
    lineHeight: 16,
  },
  input: {
    fontSize: 16,
    fontFamily: font.regular,
    color: COLORS.textDark,
    lineHeight: 22,
  },
} as const;

// ─── Layout constants ────────────────────────────────────────────
export const LAYOUT = {
  screenPaddingHorizontal: 20,
  cardPadding: 14,
  headerHeight: 56,
  tabBarHeight: 56,
  inputHeight: 48,
  buttonHeight: 50,
  buttonHeightSmall: 40,
  iconCircleSize: 52,
  iconCircleSizeSmall: 40,
  avatarSize: 80,
} as const;

// ─── Map config ──────────────────────────────────────────────────
/** MapLibre wants [lng, lat]. Tehran. */
export const TEHRAN: [number, number] = [51.389, 35.6892];
