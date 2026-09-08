export interface StoredTerminalSession {
  readonly id: string;
  readonly folderId: string;
  readonly name: string;
  readonly terminalName: string;
  readonly createdAt: number;
  readonly processId?: number;
}

export interface TerminalRestoreDescriptor {
  readonly markerSessionId?: string;
  readonly markerFolderId?: string;
  readonly folderId?: string;
  readonly terminalName: string;
}

export function readStoredTerminalSessions(
  value: unknown,
  knownFolderIds: ReadonlySet<string>
): StoredTerminalSession[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const sessions: StoredTerminalSession[] = [];
  for (const entry of value) {
    if (
      !isStoredTerminalSession(entry) ||
      !knownFolderIds.has(entry.folderId) ||
      seen.has(entry.id)
    ) {
      continue;
    }
    seen.add(entry.id);
    sessions.push(entry);
  }
  return sessions;
}

export function findStoredTerminalSession(
  sessions: Iterable<StoredTerminalSession>,
  usedIds: ReadonlySet<string>,
  descriptor: TerminalRestoreDescriptor
): StoredTerminalSession | undefined {
  if (descriptor.markerSessionId) {
    for (const session of sessions) {
      if (
        session.id === descriptor.markerSessionId &&
        !usedIds.has(session.id) &&
        (!descriptor.markerFolderId || descriptor.markerFolderId === session.folderId)
      ) {
        return session;
      }
    }
    return undefined;
  }

  if (!descriptor.folderId) {
    return undefined;
  }
  for (const session of sessions) {
    if (
      !usedIds.has(session.id) &&
      session.folderId === descriptor.folderId &&
      session.terminalName === descriptor.terminalName
    ) {
      return session;
    }
  }
  return undefined;
}

export function findStoredTerminalSessionByProcessId(
  sessions: Iterable<StoredTerminalSession>,
  usedIds: ReadonlySet<string>,
  processId: number,
  folderId?: string
): StoredTerminalSession | undefined {
  for (const session of sessions) {
    if (
      !usedIds.has(session.id) &&
      session.processId === processId &&
      (!folderId || session.folderId === folderId)
    ) {
      return session;
    }
  }
  return undefined;
}

export function findUnidentifiedStoredTerminalSessionByFolder(
  sessions: Iterable<StoredTerminalSession>,
  usedIds: ReadonlySet<string>,
  folderId: string
): StoredTerminalSession | undefined {
  for (const session of sessions) {
    if (
      !usedIds.has(session.id) &&
      session.folderId === folderId &&
      session.processId === undefined
    ) {
      return session;
    }
  }
  return undefined;
}

export function isLegacyManagedTerminalName(name: string): boolean {
  return /^Terminal [1-9]\d*$/.test(name);
}

function isStoredTerminalSession(value: unknown): value is StoredTerminalSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredTerminalSession>;
  return (
    isNonEmptyString(candidate.id) &&
    isNonEmptyString(candidate.folderId) &&
    isNonEmptyString(candidate.name) &&
    isNonEmptyString(candidate.terminalName) &&
    typeof candidate.createdAt === 'number' &&
    Number.isFinite(candidate.createdAt) &&
    candidate.createdAt >= 0 &&
    (candidate.processId === undefined || isProcessId(candidate.processId))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isProcessId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
