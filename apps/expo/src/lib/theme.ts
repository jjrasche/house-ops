// Shared color tokens — matches the PWA's CSS custom properties.
// Single source of truth for both light mode (only mode for now).

export const colors = {
  background: '#ffffff',
  foreground: '#0a0a0a',
  card: '#ffffff',
  cardForeground: '#0a0a0a',
  primary: '#171717',
  primaryForeground: '#fafafa',
  secondary: '#f5f5f5',
  secondaryForeground: '#171717',
  muted: '#f5f5f5',
  mutedForeground: '#737373',
  accent: '#f5f5f5',
  accentForeground: '#171717',
  destructive: '#ef4444',
  destructiveForeground: '#fafafa',
  border: '#e5e5e5',
  input: '#e5e5e5',
  ring: '#171717',
  success: '#16a34a',
  warning: '#eab308',
  warningMuted: 'rgba(234, 179, 8, 0.1)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 12,
  full: 9999,
} as const;
