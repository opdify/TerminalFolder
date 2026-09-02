export type ClipboardShortcutAction = 'copy' | 'paste';

export interface ClipboardShortcutEvent {
  readonly type: string;
  readonly code: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export function consumeClipboardShortcut(
  event: ClipboardShortcutEvent,
  allowCopy: boolean,
  allowPaste: boolean
): ClipboardShortcutAction | undefined {
  if (event.type !== 'keydown') {
    return undefined;
  }

  const copy =
    (event.metaKey && event.code === 'KeyC') ||
    (event.ctrlKey && event.shiftKey && event.code === 'KeyC');
  const paste =
    (event.metaKey && event.code === 'KeyV') ||
    (event.ctrlKey && event.shiftKey && event.code === 'KeyV');
  const action = copy && allowCopy ? 'copy' : paste && allowPaste ? 'paste' : undefined;
  if (!action) {
    return undefined;
  }

  // Returning false from xterm's custom key handler does not cancel the browser's
  // native clipboard event. Explicitly cancel it so paste reaches the PTY once.
  event.preventDefault();
  event.stopPropagation();
  return action;
}
