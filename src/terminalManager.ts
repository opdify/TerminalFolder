import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { normalizeManagementName } from './managementName';
import type { StoredFolder, TerminalStatus } from './model';
import { nextTerminalName } from './terminalNaming';

export interface ManagedTerminalSession {
  readonly id: string;
  readonly folderId: string;
  name: string;
  readonly status: TerminalStatus;
  readonly createdAt: number;
  readonly terminal: vscode.Terminal;
}

export class TerminalManager implements vscode.Disposable {
  private readonly sessions = new Map<string, ManagedTerminalSession>();
  private readonly subscriptions: vscode.Disposable[];
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly removeEmitter = new vscode.EventEmitter<string>();
  private disposed = false;
  private selectedId: string | undefined;

  public readonly onDidChange = this.changeEmitter.event;
  public readonly onDidRemove = this.removeEmitter.event;

  public constructor() {
    this.subscriptions = [
      vscode.window.onDidChangeActiveTerminal((terminal) => this.handleActiveTerminal(terminal)),
      vscode.window.onDidCloseTerminal((terminal) => this.handleClosedTerminal(terminal))
    ];
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
      'Create or select a managed terminal in Terminal Projects first.'
    );
  }

  public create(folder: StoredFolder): ManagedTerminalSession {
    if (this.disposed) {
      throw new Error('Terminal manager is disposed.');
    }

    const name = nextTerminalName(this.list(folder.id).map((session) => session.name));
    const terminal = vscode.window.createTerminal(terminalOptions(folder, name));
    const session: ManagedTerminalSession = {
      id: randomUUID(),
      folderId: folder.id,
      name,
      status: 'running',
      createdAt: Date.now(),
      terminal
    };
    this.sessions.set(session.id, session);
    this.changeEmitter.fire();
    return session;
  }

  public rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    const normalized = normalizeManagementName(name);
    if (!session || !normalized) {
      return;
    }
    session.name = normalized;
    this.changeEmitter.fire();
  }

  public async kill(id: string): Promise<void> {
    const session = this.remove(id);
    session?.terminal.dispose();
  }

  public async killFolder(folderId: string): Promise<void> {
    const sessions = [...this.list(folderId)];
    for (const session of sessions) {
      this.remove(session.id);
      session.terminal.dispose();
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
    for (const session of this.sessions.values()) {
      session.terminal.dispose();
    }
    this.sessions.clear();
    this.changeEmitter.dispose();
    this.removeEmitter.dispose();
  }

  private handleActiveTerminal(terminal: vscode.Terminal | undefined): void {
    const session = terminal
      ? [...this.sessions.values()].find((candidate) => candidate.terminal === terminal)
      : undefined;
    if (session) {
      this.setSelected(session.id);
    }
  }

  private handleClosedTerminal(terminal: vscode.Terminal): void {
    const session = [...this.sessions.values()].find(
      (candidate) => candidate.terminal === terminal
    );
    if (session) {
      this.remove(session.id);
    }
  }

  private remove(id: string): ManagedTerminalSession | undefined {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    this.sessions.delete(id);
    if (this.selectedId === id) {
      this.selectedId = undefined;
    }
    this.removeEmitter.fire(id);
    this.changeEmitter.fire();
    return session;
  }

  private setSelected(id: string | undefined): void {
    if (this.selectedId === id) {
      return;
    }
    this.selectedId = id;
    this.changeEmitter.fire();
  }
}

function terminalOptions(folder: StoredFolder, name: string): vscode.TerminalOptions {
  const configuration = vscode.workspace.getConfiguration('terminalProjects');
  const shellPath = configuration.get<string>('shell', '').trim();
  const shellArgs = configuration
    .get<string[]>('shellArgs', [])
    .filter((argument): argument is string => typeof argument === 'string');
  const options: vscode.TerminalOptions = {
    name,
    cwd: vscode.Uri.parse(folder.uri),
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
