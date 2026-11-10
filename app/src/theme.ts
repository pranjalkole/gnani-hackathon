/**
 * Crewline design tokens.
 *
 * The palette keeps the warm cream canvas, forest-green actions and safety
 * orange accents while providing accessible semantic text colors. Tokens are
 * grouped so a future dark theme can swap values without touching screens.
 */

export const colors = {
  // Canvas and surfaces
  background: '#F8F5EE',
  surface: '#FFFDF8',
  surfaceMuted: '#F0EBDF',
  surfaceExpanded: '#FCFBF6',

  // Text
  ink: '#15251F',
  inkSoft: '#46544E',
  inkFaint: '#5F6B65',

  // Brand
  forest: '#173D32',
  forestPressed: '#0E2C24',
  sage: '#DFE9DD',
  accent: '#E8A15D',
  accentSoft: '#F8E7D1',

  // Lines
  line: '#DED7C9',
  lineStrong: '#BBB2A0',

  // Semantic states
  danger: '#A83F36',
  dangerSoft: '#F8E7E3',
  warning: '#925615',
  warningSoft: '#F8E7CF',
  success: '#2F6B52',
  successSoft: '#E1ECDD',
  info: '#3D5A73',
  infoSoft: '#E7EEF3',

  // Fixed / overlay values
  white: '#FFFFFF',
  scrim: 'rgba(15, 28, 23, 0.52)',
  onForest: 'rgba(255, 255, 255, 0.92)',
  onForestMuted: 'rgba(255, 255, 255, 0.72)',
  onForestFaint: 'rgba(255, 255, 255, 0.55)',
  onForestOverlay: 'rgba(255, 255, 255, 0.12)',
  onForestOverlayStrong: 'rgba(255, 255, 255, 0.16)',
  forestGlow: 'rgba(232, 161, 93, 0.16)',

  // Camera and media
  cameraBackground: '#0E1A16',
  cameraOverlay: 'rgba(14, 26, 22, 0.72)',
  cameraOverlayStrong: 'rgba(14, 26, 22, 0.62)',
  damagedSegment: '#E58B7A',
  previewBadge: 'rgba(255, 255, 255, 0.94)',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  displayCompact: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  screenTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  cardTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
} as const;

export const gutters = {
  phone: 20,
  tablet: 32,
} as const;
