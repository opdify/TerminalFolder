export type TerminalFontWeight = number | 'normal' | 'bold';
export type TerminalGpuAcceleration = 'auto' | 'on' | 'off';

export interface TerminalAppearance {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: TerminalFontWeight;
  readonly fontWeightBold: TerminalFontWeight;
  readonly letterSpacing: number;
  readonly lineHeight: number;
  readonly minimumContrastRatio: number;
  readonly gpuAcceleration: TerminalGpuAcceleration;
}

export function defaultTerminalAppearance(fontFamily = 'monospace'): TerminalAppearance {
  return {
    fontFamily,
    fontSize: 14,
    fontWeight: 'normal',
    fontWeightBold: 'bold',
    letterSpacing: 0,
    lineHeight: 1,
    minimumContrastRatio: 4.5,
    gpuAcceleration: 'auto'
  };
}

export function normalizeTerminalAppearance(
  value: unknown,
  fallbackFontFamily = 'monospace'
): TerminalAppearance {
  const defaults = defaultTerminalAppearance(fallbackFontFamily);
  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const candidate = value as Record<string, unknown>;
  return {
    fontFamily:
      typeof candidate.fontFamily === 'string' && candidate.fontFamily.trim()
        ? candidate.fontFamily.trim()
        : defaults.fontFamily,
    fontSize: clampNumber(candidate.fontSize, 6, 100, defaults.fontSize),
    fontWeight: normalizeFontWeight(candidate.fontWeight, defaults.fontWeight),
    fontWeightBold: normalizeFontWeight(candidate.fontWeightBold, defaults.fontWeightBold),
    letterSpacing: clampNumber(candidate.letterSpacing, -5, 20, defaults.letterSpacing),
    lineHeight: clampNumber(candidate.lineHeight, 1, 3, defaults.lineHeight),
    minimumContrastRatio: clampNumber(
      candidate.minimumContrastRatio,
      1,
      21,
      defaults.minimumContrastRatio
    ),
    gpuAcceleration: normalizeGpuAcceleration(candidate.gpuAcceleration)
  };
}

function normalizeFontWeight(
  value: unknown,
  fallback: TerminalFontWeight
): TerminalFontWeight {
  if (value === 'normal' || value === 'bold') {
    return value;
  }
  if (typeof value === 'string' && /^(?:[1-9][0-9]{0,2}|1000)$/.test(value)) {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(1000, Math.round(value)));
  }
  return fallback;
}

function normalizeGpuAcceleration(value: unknown): TerminalGpuAcceleration {
  return value === 'on' || value === 'off' ? value : 'auto';
}

function clampNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}
