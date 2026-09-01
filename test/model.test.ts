import { describe, expect, it } from 'vitest';
import { clampTerminalDimensions, OutputBuffer } from '../src/model';

describe('OutputBuffer', () => {
  it('retains complete output below the limit', () => {
    const buffer = new OutputBuffer(20);
    buffer.append('hello');
    buffer.append(' world');
    expect(buffer.toString()).toBe('hello world');
    expect(buffer.length).toBe(11);
  });

  it('trims only the oldest output', () => {
    const buffer = new OutputBuffer(8);
    buffer.append('1234');
    buffer.append('567');
    buffer.append('890');
    expect(buffer.toString()).toBe('34567890');
    expect(buffer.length).toBe(8);
  });

  it('handles a single chunk larger than the limit', () => {
    const buffer = new OutputBuffer(5);
    buffer.append('0123456789');
    expect(buffer.toString()).toBe('56789');
  });

  it('can be cleared', () => {
    const buffer = new OutputBuffer(5);
    buffer.append('123');
    buffer.clear();
    expect(buffer.toString()).toBe('');
    expect(buffer.length).toBe(0);
  });
});

describe('clampTerminalDimensions', () => {
  it('sanitizes terminal dimensions', () => {
    expect(clampTerminalDimensions(0, 4000)).toEqual({ cols: 2, rows: 1000 });
    expect(clampTerminalDimensions(81.9, 24.7)).toEqual({ cols: 81, rows: 24 });
  });

  it('rejects non-finite values', () => {
    expect(clampTerminalDimensions(Number.NaN, 24)).toBeUndefined();
    expect(clampTerminalDimensions(80, Number.POSITIVE_INFINITY)).toBeUndefined();
  });
});
