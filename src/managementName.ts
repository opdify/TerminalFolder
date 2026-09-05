export function normalizeManagementName(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}
