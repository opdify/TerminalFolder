import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { normalizeManagementName } from './managementName';
import type { StoredFolder, TerminalStatus } from './model';
import {
  pathsReferToSameDirectory,
  resolveProcessWorkingDirectory
} from './processCwd';
import {
  findStoredTerminalSession,
  findStoredTerminalSessionByProcessId,
  findUnidentifiedStoredTerminalSessionByFolder,
  isLegacyManagedTerminalName,
  readStoredTerminalSessions,
  type StoredTerminalSession
} from './terminalPersistence';
import { nextTerminalName } from './terminalNaming';

const STORAGE_KEY = 'terminalFolder.sessions.v1';
const SESSION_ID_ENV = 'VSCODE_TERMINAL_FOLDER_SESSION_ID';
const FOLDER_ID_ENV = 'VSCODE_TERMINAL_FOLDER_FOLDER_ID';

export interface ManagedTerminalSession {
  readonly id: string;
  readonly folderId: string;
  name: string;
  readonly terminalName: string;
  readonly status: TerminalStatus;
  readonly createdAt: number;
  readonly terminal: vscode.Terminal;
}

export class TerminalManager implements vscode.Disposable {
  private readonly sessions = new Map<string, ManagedTerminalSession>();
  private readonly storedSessions = new Map<string, StoredTerminalSession>();
  private readonly folders = new Map<string, StoredFolder>();
  private readonly legacyCandidates = new Set<vscode.Terminal>();
  private readonly pendingProcessRestores = new WeakSet<vscode.Terminal>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly removeEmitter = new vscode.EventEmitter<string>();
  private persistTail: Promise<void> = Promise.resolve();
  private restoreOrdinal = 0;
  private readonly allowUntrackedLegacyAdoption: boolean;
  private disposed = false;
  private selectedId: string | undefined;

  public readonly onDidChange = this.changeEmitter.event;
  public readonly onDidRemove = this.removeEmitter.event;

  public constructor(
    private readonly state: vscode.Memento,
    folders: readonly StoredFolder[]
  ) {
    for (const folder of folders) {
      this.folders.set(folder.id, folder);
    }
    const stored = readStoredTerminalSessions(
      this.state.get<unknown>(STORAGE_KEY, []),
      new Set(this.folders.keys())
    );
    for (const session of stored) {
      this.storedSessions.set(session.id, session);
    }
    this.allowUntrackedLegacyAdoption = stored.length === 0;
    for (const terminal of vscode.window.terminals) {
      this.legacyCandidates.add(terminal);
    }

    this.subscriptions = [
      vscode.window.onDidOpenTerminal((terminal) => this.handleOpenedTerminal(terminal)),
      vscode.window.onDidChangeActiveTerminal((terminal) => this.handleActiveTerminal(terminal)),
      vscode.window.onDidCloseTerminal((terminal) => this.handleClosedTerminal(terminal)),
      vscode.window.onDidChangeTerminalShellIntegration(({ terminal }) =>
        this.handleShellIntegration(terminal)
      )
    ];

    for (const terminal of vscode.window.terminals) {
      const session = this.restoreTerminal(terminal, this.legacyCandidates.has(terminal));
      if (!session) {
        this.scheduleProcessRestore(terminal);
      }
    }
    this.handleActiveTerminal(vscode.window.activeTerminal);
  }

  public list(folderId?: string): readonly ManagedTerminalSession[] {
    return [...this.sessions.values()]
      .filter((session) => folderId === undefined || session.folderId === folderId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public get(id: string): ManagedTerminalSession | undefined {
    return this.sessions.get(id);
  }

  public get selectedTerminalId(): string | undefined {
    return this.selectedId;
  }

  public select(id: string | undefined): void {
    if (id === undefined) {
      this.setSelected(undefined);
      return;
    }
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    this.setSelected(id);
    session.terminal.show(false);
  }

  public showSelected(): void {
    const selected = this.selectedId ? this.sessions.get(this.selectedId) : undefined;
    if (selected) {
      selected.terminal.show(false);
      return;
    }
    void vscode.window.showInformationMessage(
      'Create or select a managed terminal in TerminalFolder first.'
    );
  }

  public create(folder: StoredFolder): ManagedTerminalSession {
    if (this.disposed) {
      throw new Error('Terminal manager is disposed.');
    }

    this.folders.set(folder.id, folder);
    const terminalName = nextTerminalName(
      [...this.storedSessions.values()]
        .filter((session) => session.folderId === folder.id)
        .map((session) => session.terminalName)
    );
    const id = randomUUID();
    const stored: StoredTerminalSession = {
      id,
      folderId: folder.id,
      name: terminalName,
      terminalName,
      createdAt: Date.now()
    };
    this.storedSessions.set(id, stored);

    let terminal: vscode.Terminal;
    try {
      terminal = vscode.window.createTerminal(terminalOptions(folder, terminalName, id));
    } catch (error) {
      this.storedSessions.delete(id);
      throw error;
    }

    const session = this.sessions.get(id) ?? this.attachTerminal(stored, terminal);
    void this.queuePersist();
    this.setSelected(session.id);
    return session;
  }

  public rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    const normalized = normalizeManagementName(name);
    if (!session || !normalized) {
      return;
    }
    session.name = normalized;
    const stored = this.storedSessions.get(id);
    if (stored) {
      this.storedSessions.set(id, { ...stored, name: normalized });
      void this.queuePersist();
    }
    this.changeEmitter.fire();
  }

  public async kill(id: string): Promise<void> {
    const session = this.remove(id, false);
    session?.terminal.dispose();
    await this.queuePersist();
  }

  public async killFolder(folderId: string): Promise<void> {
    const sessions = [...this.list(folderId)];
    let changed = false;
    for (const session of sessions) {
      this.remove(session.id, false);
      session.terminal.dispose();
      changed = true;
    }
    for (const stored of [...this.storedSessions.values()]) {
      if (stored.folderId === folderId) {
        this.storedSessions.delete(stored.id);
        changed = true;
      }
    }
    this.folders.delete(folderId);
    if (changed) {
      await this.queuePersist();
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }

    // VS Code owns native terminal lifetimes. Keeping them alive here lets its
    // persistent-session support carry them across a window reload.
    this.sessions.clear();
    this.changeEmitter.dispose();
    this.removeEmitter.dispose();
  }

  private handleOpenedTerminal(terminal: vscode.Terminal): void {
    const session = this.restoreTerminal(terminal, false);
    if (!session) {
      this.scheduleProcessRestore(terminal);
      return;
    }
    if (vscode.window.activeTerminal === terminal) {
      this.setSelected(session.id);
    }
    this.changeEmitter.fire();
  }

  private handleShellIntegration(terminal: vscode.Terminal): void {
    if (this.sessionForTerminal(terminal)) {
      return;
    }
    const session = this.restoreTerminal(terminal, this.legacyCandidates.has(terminal));
    if (!session) {
      return;
    }
    if (vscode.window.activeTerminal === terminal) {
      this.setSelected(session.id);
    }
    this.changeEmitter.fire();
  }

  private handleActiveTerminal(terminal: vscode.Terminal | undefined): void {
    const session = terminal ? this.sessionForTerminal(terminal) : undefined;
    if (session) {
      this.setSelected(session.id);
    }
  }

  private handleClosedTerminal(terminal: vscode.Terminal): void {
    const session = this.sessionForTerminal(terminal);
    if (session) {
      this.remove(session.id);
      return;
    }

    const descriptor = this.restoreDescriptor(terminal);
    const stored = findStoredTerminalSession(
      this.storedSessions.values(),
      new Set(this.sessions.keys()),
      descriptor
    );
    if (stored) {
      this.remove(stored.id);
      return;
    }

    void terminal.processId.then((processId) => {
      if (!processId || this.disposed) {
        return;
      }
      const processMatch = findStoredTerminalSessionByProcessId(
        this.storedSessions.values(),
        new Set(this.sessions.keys()),
        processId,
        descriptor.folderId
      );
      if (processMatch) {
        this.remove(processMatch.id);
      }
    });
  }

  private restoreTerminal(
    terminal: vscode.Terminal,
    allowLegacyAdoption: boolean
  ): ManagedTerminalSession | undefined {
    const existing = this.sessionForTerminal(terminal);
    if (existing) {
      return existing;
    }

    const options = asTerminalOptions(terminal.creationOptions);
    if (!options) {
      return undefined;
    }
    const descriptor = this.restoreDescriptor(terminal);
    const usedIds = new Set(this.sessions.keys());
    let stored = findStoredTerminalSession(
      this.storedSessions.values(),
      usedIds,
      descriptor
    );
    if (
      !stored &&
      allowLegacyAdoption &&
      descriptor.folderId &&
      isStrippedRestoredOptions(options)
    ) {
      stored = findUnidentifiedStoredTerminalSessionByFolder(
        this.storedSessions.values(),
        usedIds,
        descriptor.folderId
      );
    }

    const markedFolder = descriptor.markerFolderId
      ? this.folders.get(descriptor.markerFolderId)
      : undefined;
    if (!stored && descriptor.markerSessionId && markedFolder) {
      stored = {
        id: descriptor.markerSessionId,
        folderId: markedFolder.id,
        name: descriptor.terminalName,
        terminalName: descriptor.terminalName,
        createdAt: Date.now() + this.restoreOrdinal++
      };
      this.storedSessions.set(stored.id, stored);
      void this.queuePersist();
    }

    if (
      !stored &&
      !descriptor.markerSessionId &&
      allowLegacyAdoption &&
      this.allowUntrackedLegacyAdoption &&
      descriptor.folderId &&
      (options.location === undefined || isEditorLocation(options.location)) &&
      (isLegacyManagedTerminalName(descriptor.terminalName) ||
        isStrippedRestoredOptions(options))
    ) {
      stored = this.createLegacyStoredSession(
        descriptor.folderId,
        descriptor.terminalName
      );
    }

    return stored ? this.attachTerminal(stored, terminal) : undefined;
  }

  private restoreDescriptor(terminal: vscode.Terminal): {
    markerSessionId?: string;
    markerFolderId?: string;
    folderId?: string;
    terminalName: string;
  } {
    const options = asTerminalOptions(terminal.creationOptions);
    const markerSessionId = environmentValue(options?.env, SESSION_ID_ENV);
    const markerFolderId = environmentValue(options?.env, FOLDER_ID_ENV);
    const folderId = markerFolderId && this.folders.has(markerFolderId)
      ? markerFolderId
      : this.folderForCwd(options?.cwd ?? terminal.shellIntegration?.cwd)?.id;
    const terminalName = options?.name?.trim() || terminal.name;
    return { markerSessionId, markerFolderId, folderId, terminalName };
  }

  private folderForCwd(cwd: string | vscode.Uri | undefined): StoredFolder | undefined {
    if (!cwd) {
      return undefined;
    }
    return [...this.folders.values()].find((folder) => cwdMatchesFolder(cwd, folder.uri));
  }

  private attachTerminal(
    stored: StoredTerminalSession,
    terminal: vscode.Terminal
  ): ManagedTerminalSession {
    const session: ManagedTerminalSession = {
      id: stored.id,
      folderId: stored.folderId,
      name: stored.name,
      terminalName: stored.terminalName,
      status: 'running',
      createdAt: stored.createdAt,
      terminal
    };
    this.sessions.set(session.id, session);
    this.legacyCandidates.delete(terminal);
    this.trackProcessId(session);
    return session;
  }

  private scheduleProcessRestore(terminal: vscode.Terminal): void {
    if (this.pendingProcessRestores.has(terminal)) {
      return;
    }
    this.pendingProcessRestores.add(terminal);
    void terminal.processId.then(async (processId) => {
      if (!processId || this.disposed || this.sessionForTerminal(terminal)) {
        return;
      }
      let descriptor = this.restoreDescriptor(terminal);
      let stored = findStoredTerminalSessionByProcessId(
        this.storedSessions.values(),
        new Set(this.sessions.keys()),
        processId,
        descriptor.folderId
      );
      if (!stored && this.legacyCandidates.has(terminal)) {
        let folderId = descriptor.folderId;
        if (!folderId) {
          const cwd = await resolveProcessWorkingDirectory(processId);
          if (this.disposed || this.sessionForTerminal(terminal)) {
            return;
          }
          folderId = (await this.folderForProcessCwd(cwd))?.id;
          descriptor = { ...descriptor, folderId };
        }
        if (folderId) {
          stored = findUnidentifiedStoredTerminalSessionByFolder(
            this.storedSessions.values(),
            new Set(this.sessions.keys()),
            folderId
          );
          if (!stored && this.allowUntrackedLegacyAdoption) {
            stored = this.createLegacyStoredSession(
              folderId,
              descriptor.terminalName
            );
          }
        }
      }
      if (!stored) {
        return;
      }
      const session = this.attachTerminal(stored, terminal);
      if (vscode.window.activeTerminal === terminal) {
        this.setSelected(session.id);
      }
      this.changeEmitter.fire();
    });
  }

  private createLegacyStoredSession(
    folderId: string,
    terminalName: string
  ): StoredTerminalSession {
    const managementName = isLegacyManagedTerminalName(terminalName)
      ? terminalName
      : nextTerminalName(
          [...this.storedSessions.values()]
            .filter((session) => session.folderId === folderId)
            .map((session) => session.name)
        );
    const stored: StoredTerminalSession = {
      id: randomUUID(),
      folderId,
      name: managementName,
      terminalName: terminalName || managementName,
      createdAt: Date.now() + this.restoreOrdinal++
    };
    this.storedSessions.set(stored.id, stored);
    void this.queuePersist();
    return stored;
  }

  private async folderForProcessCwd(
    cwd: string | undefined
  ): Promise<StoredFolder | undefined> {
    if (!cwd) {
      return undefined;
    }
    const directMatch = this.folderForCwd(cwd);
    if (directMatch) {
      return directMatch;
    }
    for (const folder of this.folders.values()) {
      const folderPath = vscode.Uri.parse(folder.uri).fsPath;
      if (await pathsReferToSameDirectory(cwd, folderPath)) {
        return folder;
      }
    }
    return undefined;
  }

  private trackProcessId(session: ManagedTerminalSession): void {
    void session.terminal.processId.then((processId) => {
      if (!processId || this.disposed) {
        return;
      }
      const current = this.sessions.get(session.id);
      const stored = this.storedSessions.get(session.id);
      if (
        current?.terminal !== session.terminal ||
        !stored ||
        stored.processId === processId
      ) {
        return;
      }
      this.storedSessions.set(session.id, { ...stored, processId });
      void this.queuePersist();
    });
  }

  private sessionForTerminal(terminal: vscode.Terminal): ManagedTerminalSession | undefined {
    return [...this.sessions.values()].find((candidate) => candidate.terminal === terminal);
  }

  private remove(id: string, persist = true): ManagedTerminalSession | undefined {
    const session = this.sessions.get(id);
    const hadStoredSession = this.storedSessions.delete(id);
    if (!session && !hadStoredSession) {
      return undefined;
    }
    this.sessions.delete(id);
    if (this.selectedId === id) {
      this.selectedId = undefined;
    }
    this.removeEmitter.fire(id);
    this.changeEmitter.fire();
    if (persist) {
      void this.queuePersist();
    }
    return session;
  }

  private setSelected(id: string | undefined): void {
    if (this.selectedId === id) {
      return;
    }
    this.selectedId = id;
    this.changeEmitter.fire();
  }

  private queuePersist(): Promise<void> {
    const snapshot = [...this.storedSessions.values()].sort(
      (left, right) => left.createdAt - right.createdAt
    );
    this.persistTail = this.persistTail
      .then(() => this.state.update(STORAGE_KEY, snapshot))
      .catch((error: unknown) => {
        console.error('Unable to persist TerminalFolder terminal sessions.', error);
      });
    return this.persistTail;
  }
}

function terminalOptions(
  folder: StoredFolder,
  name: string,
  sessionId: string
): vscode.TerminalOptions {
  const configuration = vscode.workspace.getConfiguration('terminalFolder');
  const shellPath = configuration.get<string>('shell', '').trim();
  const shellArgs = configuration
    .get<string[]>('shellArgs', [])
    .filter((argument): argument is string => typeof argument === 'string');
  const options: vscode.TerminalOptions = {
    name,
    cwd: vscode.Uri.parse(folder.uri),
    env: {
      [SESSION_ID_ENV]: sessionId,
      [FOLDER_ID_ENV]: folder.id
    },
    iconPath: new vscode.ThemeIcon('terminal'),
    location: vscode.TerminalLocation.Editor
  };
  if (shellPath) {
    options.shellPath = shellPath;
  }
  if (shellArgs.length > 0) {
    options.shellArgs = shellArgs;
  }
  return options;
}

function asTerminalOptions(
  options: Readonly<vscode.TerminalOptions | vscode.ExtensionTerminalOptions>
): Readonly<vscode.TerminalOptions> | undefined {
  return 'pty' in options ? undefined : options;
}

function environmentValue(
  environment: vscode.TerminalOptions['env'],
  name: string
): string | undefined {
  const value = environment?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isEditorLocation(location: vscode.TerminalOptions['location']): boolean {
  return (
    location === vscode.TerminalLocation.Editor ||
    (typeof location === 'object' && location !== null && 'viewColumn' in location)
  );
}

function isStrippedRestoredOptions(
  options: Readonly<vscode.TerminalOptions>
): boolean {
  return (
    options.name === undefined &&
    options.cwd === undefined &&
    options.env === undefined &&
    options.location === undefined
  );
}

function cwdMatchesFolder(cwd: string | vscode.Uri, folderValue: string): boolean {
  const folder = vscode.Uri.parse(folderValue);
  if (cwd instanceof vscode.Uri) {
    return normalizedUri(cwd) === normalizedUri(folder);
  }

  if (cwd.includes('://')) {
    return normalizedUri(vscode.Uri.parse(cwd)) === normalizedUri(folder);
  }
  return normalizedPath(cwd) === normalizedPath(folder.fsPath);
}

function normalizedUri(uri: vscode.Uri): string {
  return uri.toString().replace(/\/$/, '');
}

function normalizedPath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
