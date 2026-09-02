import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { TerminalSnapshot } from './model';
import type { TerminalManager } from './terminalManager';

interface WebviewMessage {
  readonly type?: unknown;
  readonly terminalId?: unknown;
  readonly data?: unknown;
  readonly cols?: unknown;
  readonly rows?: unknown;
}

export class TerminalPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private webviewReady = false;
  private readonly subscriptions: vscode.Disposable[];

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly terminals: TerminalManager
  ) {
    this.subscriptions = [
      terminals.onDidWrite(({ terminalId, data }) => {
        void this.post({ type: 'output', terminalId, data });
      }),
      terminals.onDidRemove((terminalId) => {
        void this.post({ type: 'removed', terminalId });
      }),
      terminals.onDidExit(({ terminalId, exitCode }) => {
        void this.post({ type: 'exited', terminalId, exitCode });
      }),
      terminals.onDidChange(() => {
        void this.post({
          type: 'selectionChanged',
          terminalId: terminals.selectedTerminalId
        });
      })
    ];
  }

  public show(terminalId?: string): void {
    if (terminalId !== undefined) {
      this.terminals.select(terminalId);
    }

    if (!this.panel) {
      this.webviewReady = false;
      this.panel = vscode.window.createWebviewPanel(
        'terminalProjects.surface',
        'Terminal Projects',
        vscode.ViewColumn.Active,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
        }
      );
      this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'activity-terminal.svg');
      this.panel.webview.html = this.html(this.panel.webview);
      this.panel.webview.onDidReceiveMessage(
        (message: WebviewMessage) => this.receive(message),
        undefined,
        this.subscriptions
      );
      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
          this.webviewReady = false;
        },
        undefined,
        this.subscriptions
      );
    } else {
      this.panel.reveal(vscode.ViewColumn.Active, false);
    }

    if (terminalId !== undefined) {
      const snapshot = this.terminals.snapshot(terminalId);
      if (snapshot) {
        void this.post({ type: 'select', terminal: snapshot });
      }
    }
  }

  public terminalCreated(terminalId: string): void {
    const snapshot = this.terminals.snapshot(terminalId);
    if (!snapshot) {
      return;
    }
    void this.post({ type: 'created', terminal: snapshot });
  }

  public terminalRenamed(terminalId: string): void {
    const snapshot = this.terminals.snapshot(terminalId);
    if (!snapshot) {
      return;
    }
    void this.post({ type: 'renamed', terminal: snapshot });
  }

  public dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private receive(message: WebviewMessage): void {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return;
    }

    switch (message.type) {
      case 'ready':
        void this.post({
          type: 'initialize',
          terminals: this.terminals.snapshots(),
          activeId: this.terminals.selectedTerminalId,
          scrollback: vscode.workspace
            .getConfiguration('terminalProjects')
            .get<number>('scrollback', 5000),
          appearance: terminalAppearance()
        }, true);
        this.webviewReady = true;
        break;
      case 'input':
        if (typeof message.terminalId === 'string' && typeof message.data === 'string') {
          this.terminals.write(message.terminalId, message.data);
        }
        break;
      case 'resize':
        if (typeof message.cols === 'number' && typeof message.rows === 'number') {
          this.terminals.resizeAll(message.cols, message.rows);
        }
        break;
    }
  }

  private async post(message: unknown, beforeReady = false): Promise<void> {
    if (this.panel && (this.webviewReady || beforeReady)) {
      await this.panel.webview.postMessage(message);
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview.css'));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Terminal Projects</title>
</head>
<body>
  <main class="surface">
    <header class="surface__header">
      <span id="title" class="surface__title">Terminal Projects</span>
      <span id="status" class="surface__status"></span>
    </header>
    <section id="terminal-host" class="terminal-host" aria-label="Terminal"></section>
    <section id="empty" class="empty-state">
      <div class="empty-state__icon" aria-hidden="true">›_</div>
      <div>Select a terminal from Terminal Projects.</div>
    </section>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

export type { TerminalSnapshot };

function terminalAppearance(): {
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
} {
  const terminal = vscode.workspace.getConfiguration('terminal.integrated');
  const editor = vscode.workspace.getConfiguration('editor');
  return {
    fontFamily:
      terminal.get<string>('fontFamily', '').trim() ||
      editor.get<string>('fontFamily', '').trim() ||
      'monospace',
    fontSize: terminal.get<number>('fontSize', 14),
    letterSpacing: terminal.get<number>('letterSpacing', 0),
    lineHeight: terminal.get<number>('lineHeight', 1)
  };
}
