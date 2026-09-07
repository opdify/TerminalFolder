import { describe, expect, it } from 'vitest';
import { selectedKeyForActiveTerminal } from '../src/sidebarSelection';

describe('selectedKeyForActiveTerminal', () => {
  it('moves selection to a newly active terminal', () => {
    expect(
      selectedKeyForActiveTerminal('folder:workspace', 'terminal-1', 'terminal-2')
    ).toBe('terminal:terminal-2');
  });

  it('preserves a folder selection while the active terminal is unchanged', () => {
    expect(
      selectedKeyForActiveTerminal('folder:workspace', 'terminal-1', 'terminal-1')
    ).toBe('folder:workspace');
  });

  it('clears a terminal selection when there is no active managed terminal', () => {
    expect(
      selectedKeyForActiveTerminal('terminal:terminal-1', 'terminal-1', undefined)
    ).toBeUndefined();
  });
});
