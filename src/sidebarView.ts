import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FolderStore } from './folderStore';
import type { TerminalManager } from './terminalManager';

interface SidebarMessage {
  readonly type?: unknown;
  readonly folderId?: unknown;
  readonly terminalId?: unknown;
  readonly name?: unknown;
}

interface SidebarTerminal {
  readonly id: string;
  readonly name: string;
  readonly status: 'running' | 'exited';
  readonly exitCode?: number;
}

interface SidebarFolder {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly expanded: boolean;
  readonly terminals: SidebarTerminal[];
}

export class SidebarViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly expandedFolderIds: Set<string>;
  private readonly subscriptions: vscode.Disposable[];
  private view: vscode.WebviewView | undefined;
  private viewSubscriptions: vscode.Disposable[] = [];
  private ready = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly folders: FolderStore,
    private readonly terminals: TerminalManager
  ) {
    this.expandedFolderIds = new Set(folders.list().map((folder) => folder.id));
    this.subscriptions = [
      terminals.onDidChange(() => this.refresh()),
      terminals.onDidRemove(() => this.refresh())
    ];
  }

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.disposeViewSubscriptions();
    this.view = view;
    this.ready = false;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
    };
    view.webview.html = this.html(view.webview);
    this.viewSubscriptions = [
      view.webview.onDidReceiveMessage((message: SidebarMessage) => this.receive(message)),
      view.onDidDispose(() => {
        this.view = undefined;
        this.ready = false;
        this.disposeViewSubscriptions();
      })
    ];
  }

  public refresh(): void {
    const existingIds = new Set(this.folders.list().map((folder) => folder.id));
    for (const folderId of this.expandedFolderIds) {
      if (!existingIds.has(folderId)) {
        this.expandedFolderIds.delete(folderId);
      }
    }
    void this.postState();
  }

  public expandFolder(folderId: string): void {
    if (!this.folders.get(folderId)) {
      return;
    }
    this.expandedFolderIds.add(folderId);
    this.refresh();
  }

  public removeFolder(folderId: string): void {
    this.expandedFolderIds.delete(folderId);
    this.refresh();
  }

  public dispose(): void {
    this.disposeViewSubscriptions();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.view = undefined;
    this.ready = false;
  }

  private receive(message: SidebarMessage): void {
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      return;
    }

    const folderId = typeof message.folderId === 'string' ? message.folderId : undefined;
    const terminalId = typeof message.terminalId === 'string' ? message.terminalId : undefined;
    const name = typeof message.name === 'string' ? message.name : undefined;

    switch (message.type) {
      case 'ready':
        this.ready = true;
        void this.postState();
        break;
      case 'toggleFolder':
        if (!folderId || !this.folders.get(folderId)) {
          break;
        }
        if (!this.expandedFolderIds.delete(folderId)) {
          this.expandedFolderIds.add(folderId);
        }
        this.refresh();
        break;
      case 'addFolder':
        void vscode.commands.executeCommand('terminalFolder.addFolder');
        break;
      case 'addTerminal':
        if (folderId) {
          void vscode.commands.executeCommand('terminalFolder.addTerminal', folderId);
        }
        break;
      case 'selectTerminal':
        if (terminalId) {
          void vscode.commands.executeCommand('terminalFolder.selectTerminal', terminalId);
        }
        break;
      case 'renameFolder':
        if (folderId && name !== undefined) {
          void vscode.commands.executeCommand('terminalFolder.renameFolder', folderId, name);
        }
        break;
      case 'removeFolder':
        if (folderId) {
          void vscode.commands.executeCommand('terminalFolder.removeFolder', folderId);
        }
        break;
      case 'renameTerminal':
        if (terminalId && name !== undefined) {
          void vscode.commands.executeCommand('terminalFolder.renameTerminal', terminalId, name);
        }
        break;
      case 'killTerminal':
        if (terminalId) {
          void vscode.commands.executeCommand('terminalFolder.killTerminal', terminalId);
        }
        break;
    }
  }

  private async postState(): Promise<void> {
    if (!this.view || !this.ready) {
      return;
    }
    const folders: SidebarFolder[] = this.folders.list().map((folder) => {
      const expanded = this.expandedFolderIds.has(folder.id);
      return {
        id: folder.id,
        name: folder.name,
        path: vscode.Uri.parse(folder.uri).fsPath,
        expanded,
        terminals: expanded
          ? this.terminals.list(folder.id).map((terminal) => ({
              id: terminal.id,
              name: terminal.name,
              status: terminal.status
            }))
          : []
      };
    });
    await this.view.webview.postMessage({
      type: 'render',
      folders,
      activeTerminalId: this.terminals.selectedTerminalId
    });
  }

  private disposeViewSubscriptions(): void {
    const subscriptions = this.viewSubscriptions;
    this.viewSubscriptions = [];
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
  }

  private html(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'sidebarWebview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'sidebarWebview.css')
    );

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>TerminalFolder</title>
</head>
<body>
  <main id="sidebar" class="sidebar" role="tree" aria-label="TerminalFolder"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
