import { describe, expect, it } from 'vitest';
import { nextTerminalName } from '../src/terminalNaming';

describe('nextTerminalName', () => {
  it('starts at Terminal 1', () => {
    expect(nextTerminalName([])).toBe('Terminal 1');
  });

  it('uses the first available number', () => {
    expect(nextTerminalName(['Terminal 1', 'Terminal 3'])).toBe('Terminal 2');
  });

  it('ignores custom management names', () => {
    expect(nextTerminalName(['Claude frontend', 'Terminal 1'])).toBe('Terminal 2');
  });
});
