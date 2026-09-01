import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as vscode from 'vscode';
import * as pty from 'node-pty';
import killTree from 'tree-kill';
import type { StoredFolder, TerminalSession, TerminalSnapshot } from './model';
import { clampTerminalDimensions, OutputBuffer } from './model';

export interface TerminalDataEvent {
  readonly terminalId: string;
  readonly data: string;
}

export interface TerminalExitEvent {
  readonly terminalId: string;
  readonly exitCode: number;
}

export class TerminalManager implements vscode.Disposable {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly writeEmitter = new vscode.EventEmitter<TerminalDataEvent>();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly removeEmitter = new vscode.EventEmitter<string>();
  private readonly exitEmitter = new vscode.EventEmitter<TerminalExitEvent>();
  private dimensions = { cols: 100, rows: 30 };
  private disposed = false;
  private selectedId: string | undefined;

  public readonly onDidWrite = this.writeEmitter.event;
  public readonly onDidChange = this.changeEmitter.event;
  public readonly onDidRemove = this.removeEmitter.event;
  public readonly onDidExit = this.exitEmitter.event;

  public constructor(
    private readonly getFolder: (id: string) => StoredFolder | undefined,
    private readonly outputBufferLimit: number
  ) {}

  public list(folderId?: string): readonly TerminalSession[] {
    return [...this.sessions.values()]
      .filter((session) => folderId === undefined || session.folderId === folderId)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  public get(id: string): TerminalSession | undefined {
    return this.sessions.get(id);
  }

  public get selectedTerminalId(): string | undefined {
    return this.selectedId;
  }

  public select(id: string | undefined): void {
    if (id !== undefined && !this.sessions.has(id)) {
      return;
    }
    this.selectedId = id;
    this.changeEmitter.fire();
  }

  public create(folder: StoredFolder): TerminalSession {
    if (this.disposed) {
      throw new Error('Terminal manager is disposed.');
    }

    const folderUri = vscode.Uri.parse(folder.uri);
    const shell = resolveShell();
    const shellArgs = resolveShellArgs();
    const terminalNumber = this.nextTerminalNumber(folder.id);
    const session: TerminalSession = {
      id: randomUUID(),
      folderId: folder.id,
      name: `Terminal ${terminalNumber}`,
      status: 'running',
      createdAt: Date.now(),
      output: new OutputBuffer(this.outputBufferLimit)
    };

    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        environment[key] = value;
      }
    }
    environment.TERM = environment.TERM || 'xterm-256color';
    environment.COLORTERM = environment.COLORTERM || 'truecolor';
    environment.TERM_PROGRAM = 'vscode-terminal-projects';

    const processHandle = pty.spawn(shell, shellArgs, {
      name: environment.TERM,
      cols: this.dimensions.cols,
      rows: this.dimensions.rows,
      cwd: folderUri.fsPath,
      env: environment
    });
    session.pty = processHandle;
    this.sessions.set(session.id, session);

    processHandle.onData((data) => {
      if (!this.sessions.has(session.id)) {
        return;
      }
      session.output.append(data);
      this.writeEmitter.fire({ terminalId: session.id, data });
    });

    processHandle.onExit(({ exitCode }) => {
      const current = this.sessions.get(session.id);
      if (!current || current.status === 'exited') {
        return;
      }
      current.status = 'exited';
      current.exitCode = exitCode;
      current.pty = undefined;
      this.exitEmitter.fire({ terminalId: current.id, exitCode });
      this.changeEmitter.fire();
    });

    this.changeEmitter.fire();
    return session;
  }

  public write(id: string, data: string): void {
    if (this.selectedId !== id || data.length === 0 || data.length > 64 * 1024) {
      return;
    }
    const session = this.sessions.get(id);
    if (session?.status === 'running') {
      session.pty?.write(data);
    }
  }

  public resizeAll(cols: number, rows: number): void {
    const dimensions = clampTerminalDimensions(cols, rows);
    if (!dimensions) {
      return;
    }
    this.dimensions = dimensions;
    for (const session of this.sessions.values()) {
      if (session.status !== 'running') {
        continue;
      }
      try {
        session.pty?.resize(dimensions.cols, dimensions.rows);
      } catch {
        // A PTY can exit between the status check and resize.
      }
    }
  }

  public rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    const normalized = name.trim();
    if (!session || !normalized) {
      return;
    }
    session.name = normalized;
    this.changeEmitter.fire();
  }

  public snapshot(id: string): TerminalSnapshot | undefined {
    const session = this.sessions.get(id);
    if (!session) {
      return undefined;
    }
    const folder = this.getFolder(session.folderId);
    if (!folder) {
      return undefined;
    }
    return {
      id: session.id,
      folderId: session.folderId,
      folderName: folder.name,
      name: session.name,
      status: session.status,
      exitCode: session.exitCode,
      history: session.output.toString()
    };
  }

  public snapshots(): TerminalSnapshot[] {
    return this.list()
      .map((session) => this.snapshot(session.id))
      .filter((snapshot): snapshot is TerminalSnapshot => snapshot !== undefined);
  }

  public async kill(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }

    this.sessions.delete(id);
    if (this.selectedId === id) {
      this.selectedId = undefined;
    }

    const processHandle = session.pty;
    session.pty = undefined;
    session.status = 'exited';
    session.output.clear();
    if (processHandle) {
      await terminateProcessTree(processHandle.pid, processHandle);
    }

    this.removeEmitter.fire(id);
    this.changeEmitter.fire();
  }

  public async killFolder(folderId: string): Promise<void> {
    const ids = this.list(folderId).map((session) => session.id);
    await Promise.all(ids.map((id) => this.kill(id)));
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    for (const session of this.sessions.values()) {
      const processHandle = session.pty;
      if (!processHandle) {
        continue;
      }
      signalProcessGroup(processHandle.pid, 'SIGHUP');
      killTree(processHandle.pid, 'SIGHUP', () => undefined);
      try {
        processHandle.kill();
      } catch {
        // The process already exited.
      }
    }
    this.sessions.clear();
    this.writeEmitter.dispose();
    this.changeEmitter.dispose();
    this.removeEmitter.dispose();
    this.exitEmitter.dispose();
  }

  private nextTerminalNumber(folderId: string): number {
    const used = new Set(
      this.list(folderId)
        .map((session) => /^Terminal (\d+)$/.exec(session.name)?.[1])
        .filter((value): value is string => value !== undefined)
        .map(Number)
    );
    let candidate = 1;
    while (used.has(candidate)) {
      candidate += 1;
    }
    return candidate;
  }
}

function resolveShell(): string {
  const configured = vscode.workspace
    .getConfiguration('terminalProjects')
    .get<string>('shell', '')
    .trim();
  if (configured) {
    return configured;
  }

  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  return process.env.SHELL || os.userInfo().shell || '/bin/sh';
}

function resolveShellArgs(): string[] {
  return vscode.workspace
    .getConfiguration('terminalProjects')
    .get<string[]>('shellArgs', [])
    .filter((argument): argument is string => typeof argument === 'string');
}

async function terminateProcessTree(pid: number, processHandle: pty.IPty): Promise<void> {
  signalProcessGroup(pid, 'SIGHUP');
  await killTreeAsync(pid, 'SIGHUP');
  try {
    processHandle.kill();
  } catch {
    // The process may have exited after SIGHUP.
  }

  await new Promise<void>((resolve) => setTimeout(resolve, 250));
  if (isProcessAlive(pid)) {
    signalProcessGroup(pid, 'SIGKILL');
    await killTreeAsync(pid, 'SIGKILL');
  }
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === 'win32') {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // If the PTY child is not its process-group leader, tree-kill is the fallback.
  }
}

function killTreeAsync(pid: number, signal: string): Promise<void> {
  return new Promise((resolve) => {
    killTree(pid, signal, () => resolve());
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
