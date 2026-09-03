export function nextTerminalName(existingNames: readonly string[]): string {
  const used = new Set(
    existingNames
      .map((name) => /^Terminal (\d+)$/.exec(name)?.[1])
      .filter((value): value is string => value !== undefined)
      .map(Number)
  );
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return `Terminal ${candidate}`;
}
