import { describe, expect, it, vi } from 'vitest';
import { consumeClipboardShortcut, type ClipboardShortcutEvent } from '../src/clipboard';

function keyboardEvent(
  overrides: Partial<Omit<ClipboardShortcutEvent, 'preventDefault' | 'stopPropagation'>>
): {
  event: ClipboardShortcutEvent;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event: ClipboardShortcutEvent = {
    type: 'keydown',
    code: '',
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    preventDefault: () => preventDefault(),
    stopPropagation: () => stopPropagation(),
    ...overrides
  };
  return { event, preventDefault, stopPropagation };
}

describe('consumeClipboardShortcut', () => {
  it.each([
    [{ code: 'KeyV', metaKey: true }, 'paste'],
    [{ code: 'KeyV', ctrlKey: true, shiftKey: true }, 'paste'],
    [{ code: 'KeyC', metaKey: true }, 'copy'],
    [{ code: 'KeyC', ctrlKey: true, shiftKey: true }, 'copy']
  ] as const)('consumes %o as %s exactly once', (keys, expected) => {
    const { event, preventDefault, stopPropagation } = keyboardEvent(keys);

    expect(consumeClipboardShortcut(event, true, true)).toBe(expected);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('does not consume Ctrl+C without a selection', () => {
    const { event, preventDefault, stopPropagation } = keyboardEvent({
      code: 'KeyC',
      ctrlKey: true
    });

    expect(consumeClipboardShortcut(event, false, true)).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('does not consume paste for an exited terminal', () => {
    const { event, preventDefault, stopPropagation } = keyboardEvent({
      code: 'KeyV',
      metaKey: true
    });

    expect(consumeClipboardShortcut(event, false, false)).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
