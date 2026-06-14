import { Feather } from '@expo/vector-icons';
import { Platform } from 'react-native';

/**
 * FloodGuard AI brand palette — kept in sync with frontend/src/index.css.
 * The app is always dark-themed regardless of the device color scheme.
 */
export const Colors = {
  bg: '#0b1320',
  panel: '#131e30',
  panel2: '#1a2a42',
  line: '#25395a',
  text: '#e6edf6',
  textMuted: '#93a4bf',
  brand: '#38bdf8',
  brand2: '#6366f1',
  riskLow: '#22c55e',
  riskModerate: '#eab308',
  riskHigh: '#f97316',
  riskSevere: '#ef4444',
} as const;

export const RISK_COLORS: Record<string, string> = {
  Low: Colors.riskLow,
  Moderate: Colors.riskModerate,
  High: Colors.riskHigh,
  Severe: Colors.riskSevere,
};

export const RISK_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  Low: 'check-circle',
  Moderate: 'alert-circle',
  High: 'alert-triangle',
  Severe: 'alert-octagon',
};

/**
 * Custom font family names, registered via `useFonts()` in the root layout
 * from `@expo-google-fonts/plus-jakarta-sans` and `@expo-google-fonts/fraunces`.
 * Mirrors the web app's "Plus Jakarta Sans" + "Fraunces" pairing.
 */
export const Fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  serifItalic: 'Fraunces_600SemiBold_Italic',
  mono: Platform.select({ ios: 'ui-monospace', default: 'monospace' }) as string,
} as const;

/** Linear-gradient color stops, mirroring the web's brand + aurora gradients. */
export const Gradients = {
  brand: [Colors.brand, Colors.brand2] as [string, string],
  brandSoft: ['rgba(56,189,248,0.20)', 'rgba(99,102,241,0.10)'] as [string, string],
  card: ['rgba(56,189,248,0.10)', 'rgba(255,255,255,0.015)'] as [string, string],
  auroraCyan: ['rgba(56,189,248,0.38)', 'rgba(56,189,248,0)'] as [string, string],
  auroraIndigo: ['rgba(99,102,241,0.34)', 'rgba(99,102,241,0)'] as [string, string],
  auroraTeal: ['rgba(34,211,238,0.24)', 'rgba(34,211,238,0)'] as [string, string],
  auroraRose: ['rgba(239,68,68,0.18)', 'rgba(239,68,68,0)'] as [string, string],
} as const;

/** Translucent surfaces for glass-morphism panels. */
export const Glass = {
  bg: 'rgba(255,255,255,0.035)',
  bgStrong: 'rgba(255,255,255,0.05)',
  border: 'rgba(255,255,255,0.08)',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

export const MaxContentWidth = 760;

export const Shadows = {
  card: {
    shadowColor: '#020817',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  }),
} as const;
