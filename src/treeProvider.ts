import * as vscode from 'vscode';
import type { FolderStore } from './folderStore';
import type { StoredFolder, TerminalSession } from './model';
import type { TerminalManager } from './terminalManager';

export type ProjectTreeNode = FolderNode | TerminalNode | AddFolderNode;

export interface FolderNode {
  readonly kind: 'folder';
  readonly folder: StoredFolder;
}

export interface TerminalNode {
  readonly kind: 'terminal';
  readonly terminal: TerminalSession;
}

export interface AddFolderNode {
  readonly kind: 'addFolder';
}

export class ProjectTreeProvider
  implements vscode.TreeDataProvider<ProjectTreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<ProjectTreeNode | undefined>();
  private readonly subscriptions: vscode.Disposable[];

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly folders: FolderStore,
    private readonly terminals: TerminalManager
  ) {
    this.subscriptions = [
      terminals.onDidChange(() => this.refresh()),
      terminals.onDidRemove(() => this.refresh())
    ];
  }

  public refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  public getTreeItem(element: ProjectTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'folder':
        return this.folderItem(element.folder);
      case 'terminal':
        return this.terminalItem(element.terminal);
      case 'addFolder': {
        const item = new vscode.TreeItem('Add Folder…', vscode.TreeItemCollapsibleState.None);
        item.id = 'terminalProjects.addFolderItem';
        item.iconPath = new vscode.ThemeIcon('add');
        item.command = {
          command: 'terminalProjects.addFolder',
          title: 'Add Folder'
        };
        item.contextValue = 'terminalProjectAddFolder';
        return item;
      }
    }
  }

  public getChildren(element?: ProjectTreeNode): ProjectTreeNode[] {
    if (!element) {
      return [
        ...this.folders.list().map((folder): FolderNode => ({ kind: 'folder', folder })),
        { kind: 'addFolder' }
      ];
    }

    if (element.kind !== 'folder') {
      return [];
    }

    return this.terminals
      .list(element.folder.id)
      .map((terminal): TerminalNode => ({ kind: 'terminal', terminal }));
  }

  public getParent(element: ProjectTreeNode): ProjectTreeNode | undefined {
    if (element.kind !== 'terminal') {
      return undefined;
    }
    const folder = this.folders.get(element.terminal.folderId);
    return folder ? { kind: 'folder', folder } : undefined;
  }

  public dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.changeEmitter.dispose();
  }

  private folderItem(folder: StoredFolder): vscode.TreeItem {
    const item = new vscode.TreeItem(folder.name, vscode.TreeItemCollapsibleState.Expanded);
    item.id = `terminalProjects.folder.${folder.id}`;
    item.contextValue = 'terminalProjectFolder';
    item.iconPath = new vscode.ThemeIcon('folder');
    const uri = vscode.Uri.parse(folder.uri);
    item.tooltip = new vscode.MarkdownString(`**${escapeMarkdown(folder.name)}**\n\n${escapeMarkdown(uri.fsPath)}`);
    return item;
  }

  private terminalItem(terminal: TerminalSession): vscode.TreeItem {
    const item = new vscode.TreeItem(terminal.name, vscode.TreeItemCollapsibleState.None);
    item.id = `terminalProjects.terminal.${terminal.id}`;
    item.command = {
      command: 'terminalProjects.selectTerminal',
      title: 'Show Terminal',
      arguments: [terminal.id]
    };

    if (terminal.status === 'exited') {
      item.contextValue = 'terminalProjectExited';
      item.description = terminal.exitCode === undefined ? 'exited' : `exited (${terminal.exitCode})`;
      item.iconPath = new vscode.ThemeIcon(
        'circle-slash',
        new vscode.ThemeColor('disabledForeground')
      );
      item.tooltip = `${terminal.name} — process exited`;
    } else if (this.terminals.selectedTerminalId === terminal.id) {
      item.contextValue = 'terminalProjectRunning';
      item.description = 'active';
      item.iconPath = new vscode.ThemeIcon(
        'terminal',
        new vscode.ThemeColor('charts.green')
      );
      item.tooltip = `${terminal.name} — currently displayed`;
    } else {
      item.contextValue = 'terminalProjectRunning';
      item.iconPath = new vscode.ThemeIcon('terminal');
      item.tooltip = `${terminal.name} — running in background`;
    }

    return item;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-.!]/g, '\\$&');
}
