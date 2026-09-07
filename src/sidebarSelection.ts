export function selectedKeyForActiveTerminal(
  selectedKey: string | undefined,
  previousActiveTerminalId: string | undefined,
  activeTerminalId: string | undefined
): string | undefined {
  if (activeTerminalId === previousActiveTerminalId) {
    return selectedKey;
  }
  if (activeTerminalId) {
    return `terminal:${activeTerminalId}`;
  }
  return selectedKey?.startsWith('terminal:') ? undefined : selectedKey;
}
