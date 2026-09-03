import { describe, expect, it } from 'vitest';
import {
  defaultTerminalAppearance,
  normalizeTerminalAppearance
} from '../src/terminalAppearance';

describe('terminal appearance', () => {
  it('uses VS Code terminal defaults that keep text readable', () => {
    expect(defaultTerminalAppearance('Menlo')).toEqual({
      fontFamily: 'Menlo',
      fontSize: 14,
      fontWeight: 'normal',
      fontWeightBold: 'bold',
      letterSpacing: 0,
      lineHeight: 1,
      minimumContrastRatio: 4.5,
      gpuAcceleration: 'auto'
    });
  });

  it('normalizes native terminal font and renderer settings', () => {
    expect(
      normalizeTerminalAppearance({
        fontFamily: '  JetBrains Mono  ',
        fontSize: 16,
        fontWeight: '500',
        fontWeightBold: 750.4,
        letterSpacing: 1,
        lineHeight: 1.2,
        minimumContrastRatio: 7,
        gpuAcceleration: 'off'
      })
    ).toEqual({
      fontFamily: 'JetBrains Mono',
      fontSize: 16,
      fontWeight: 500,
      fontWeightBold: 750,
      letterSpacing: 1,
      lineHeight: 1.2,
      minimumContrastRatio: 7,
      gpuAcceleration: 'off'
    });
  });

  it('rejects invalid values and clamps unsafe numeric ranges', () => {
    expect(
      normalizeTerminalAppearance(
        {
          fontFamily: ' ',
          fontSize: 1000,
          fontWeight: 'heavy',
          fontWeightBold: 2000,
          letterSpacing: Number.NaN,
          lineHeight: 0,
          minimumContrastRatio: 99,
          gpuAcceleration: 'maybe'
        },
        'monospace-test'
      )
    ).toEqual({
      fontFamily: 'monospace-test',
      fontSize: 100,
      fontWeight: 'normal',
      fontWeightBold: 1000,
      letterSpacing: 0,
      lineHeight: 1,
      minimumContrastRatio: 21,
      gpuAcceleration: 'auto'
    });
  });
});
