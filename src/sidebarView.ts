import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import type { FolderStore } from './folderStore';
import type { TerminalManager } from './terminalManager';

interface SidebarMessage {
  readonly type?: unknown;
  readonly folderId?: unknown;
  readonly terminalId?: unknown;
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

interface SidebarAction {
  readonly label: string;
  readonly description: string;
  readonly command: string;
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
        void vscode.commands.executeCommand('terminalProjects.addFolder');
        break;
      case 'addTerminal':
        if (folderId) {
          void vscode.commands.executeCommand('terminalProjects.addTerminal', folderId);
        }
        break;
      case 'selectTerminal':
        if (terminalId) {
          void vscode.commands.executeCommand('terminalProjects.selectTerminal', terminalId);
        }
        break;
      case 'folderMenu':
        if (folderId) {
          void this.showFolderMenu(folderId);
        }
        break;
      case 'terminalMenu':
        if (terminalId) {
          void this.showTerminalMenu(terminalId);
        }
        break;
    }
  }

  private async showFolderMenu(folderId: string): Promise<void> {
    const folder = this.folders.get(folderId);
    if (!folder) {
      return;
    }
    const selection = await vscode.window.showQuickPick<SidebarAction>(
      [
        {
          label: '$(add) New Terminal',
          description: 'Create an independent terminal in this folder',
          command: 'terminalProjects.addTerminal'
        },
        {
          label: '$(trash) Remove Folder',
          description: 'Remove this folder from Terminal Projects',
          command: 'terminalProjects.removeFolder'
        }
      ],
      { title: folder.name, placeHolder: 'Choose a folder action' }
    );
    if (selection) {
      await vscode.commands.executeCommand(selection.command, folderId);
    }
  }

  private async showTerminalMenu(terminalId: string): Promise<void> {
    const terminal = this.terminals.get(terminalId);
    if (!terminal) {
      return;
    }
    const selection = await vscode.window.showQuickPick<SidebarAction>(
      [
        {
          label: '$(edit) Rename Terminal',
          description: 'Change the terminal management name',
          command: 'terminalProjects.renameTerminal'
        },
        {
          label: terminal.status === 'running' ? '$(trash) Kill Terminal' : '$(trash) Remove Terminal',
          description:
            terminal.status === 'running'
              ? 'Terminate the process tree and remove this terminal'
              : 'Remove this exited terminal',
          command: 'terminalProjects.killTerminal'
        }
      ],
      { title: terminal.name, placeHolder: 'Choose a terminal action' }
    );
    if (selection) {
      await vscode.commands.executeCommand(selection.command, terminalId);
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
              status: terminal.status,
              exitCode: terminal.exitCode
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
  <title>Terminal Projects</title>
</head>
<body>
  <main id="sidebar" class="sidebar" role="tree" aria-label="Terminal Projects"></main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
