import * as vscode from 'vscode';
import { FolderStore } from './folderStore';
import type { FolderNode, TerminalNode } from './treeProvider';
import { ProjectTreeProvider } from './treeProvider';
import { TerminalManager } from './terminalManager';
import { TerminalPanel } from './terminalPanel';

export function activate(context: vscode.ExtensionContext): void {
  const folders = new FolderStore(context.workspaceState);
  const outputBufferLimit = vscode.workspace
    .getConfiguration('terminalProjects')
    .get<number>('outputBufferBytes', 2 * 1024 * 1024);
  const terminals = new TerminalManager((id) => folders.get(id), outputBufferLimit);
  const tree = new ProjectTreeProvider(folders, terminals);
  const panel = new TerminalPanel(context.extensionUri, terminals);
  const treeView = vscode.window.createTreeView('terminalProjects.folders', {
    treeDataProvider: tree,
    showCollapseAll: true
  });

  context.subscriptions.push(terminals, tree, panel, treeView);

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalProjects.addFolder', async (providedUri?: vscode.Uri) => {
      const uri =
        providedUri instanceof vscode.Uri
          ? providedUri
          : (
              await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
                openLabel: 'Add Folder',
                title: 'Add a project folder for terminal management'
              })
            )?.[0];
      if (!uri) {
        return;
      }

      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if ((stat.type & vscode.FileType.Directory) === 0) {
          void vscode.window.showErrorMessage('The selected path is not a directory.');
          return;
        }
      } catch (error) {
        void vscode.window.showErrorMessage(`Cannot access the selected folder: ${errorMessage(error)}`);
        return;
      }

      const existing = folders.findByUri(uri);
      const folder = await folders.add(uri);
      tree.refresh();
      if (existing) {
        void vscode.window.showInformationMessage(`${folder.name} is already in Terminal Projects.`);
      }
      return folder;
    }),

    vscode.commands.registerCommand(
      'terminalProjects.addTerminal',
      async (node: FolderNode | string | undefined) => {
        const folderId = typeof node === 'string' ? node : node?.kind === 'folder' ? node.folder.id : undefined;
        const folder = folderId ? folders.get(folderId) : undefined;
        if (!folder) {
          return;
        }

        try {
          const uri = vscode.Uri.parse(folder.uri);
          const stat = await vscode.workspace.fs.stat(uri);
          if ((stat.type & vscode.FileType.Directory) === 0) {
            throw new Error('The saved path is no longer a directory.');
          }
          const session = terminals.create(folder);
          terminals.select(session.id);
          panel.show(session.id);
          panel.terminalCreated(session.id);
          tree.refresh();
          return session.id;
        } catch (error) {
          void vscode.window.showErrorMessage(
            `Unable to create a terminal for ${folder.name}: ${errorMessage(error)}`
          );
        }
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.selectTerminal',
      (value: TerminalNode | string | undefined) => {
        const terminalId =
          typeof value === 'string' ? value : value?.kind === 'terminal' ? value.terminal.id : undefined;
        if (!terminalId || !terminals.get(terminalId)) {
          return;
        }
        terminals.select(terminalId);
        panel.show(terminalId);
        tree.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.renameTerminal',
      async (node: TerminalNode | string | undefined) => {
        const terminalId =
          typeof node === 'string' ? node : node?.kind === 'terminal' ? node.terminal.id : undefined;
        const terminal = terminalId ? terminals.get(terminalId) : undefined;
        if (!terminal) {
          return;
        }

        const name = await vscode.window.showInputBox({
          title: 'Rename Terminal',
          prompt: 'Terminal management name (does not affect the shell)',
          value: terminal.name,
          valueSelection: [0, terminal.name.length],
          validateInput: (value) => (value.trim() ? undefined : 'Name cannot be empty.')
        });
        if (!name) {
          return;
        }
        terminals.rename(terminal.id, name);
        panel.terminalRenamed(terminal.id);
        tree.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.killTerminal',
      async (node: TerminalNode | string | undefined) => {
        const terminalId =
          typeof node === 'string' ? node : node?.kind === 'terminal' ? node.terminal.id : undefined;
        if (terminalId) {
          await terminals.kill(terminalId);
          tree.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.removeFolder',
      async (node: FolderNode | string | undefined) => {
        const folderId = typeof node === 'string' ? node : node?.kind === 'folder' ? node.folder.id : undefined;
        const folder = folderId ? folders.get(folderId) : undefined;
        if (!folder) {
          return;
        }

        const running = terminals.list(folder.id);
        if (running.length > 0) {
          const choice = await vscode.window.showWarningMessage(
            `Remove ${folder.name}? Its ${running.length} terminal${running.length === 1 ? '' : 's'} will be killed.`,
            { modal: true },
            'Remove and Kill'
          );
          if (choice !== 'Remove and Kill') {
            return;
          }
          await terminals.killFolder(folder.id);
        }

        await folders.remove(folder.id);
        tree.refresh();
      }
    ),

    vscode.commands.registerCommand('terminalProjects.openSurface', () => {
      panel.show(terminals.selectedTerminalId);
    }),

    vscode.commands.registerCommand('terminalProjects.refresh', () => tree.refresh())
  );
}

export function deactivate(): void {
  // VS Code disposes the subscriptions registered by activate, including every PTY.
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
