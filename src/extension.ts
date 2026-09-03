import * as vscode from 'vscode';
import { FolderStore } from './folderStore';
import { SidebarViewProvider } from './sidebarView';
import { TerminalManager } from './terminalManager';

export function activate(context: vscode.ExtensionContext): void {
  const folders = new FolderStore(context.workspaceState);
  const terminals = new TerminalManager();
  const sidebar = new SidebarViewProvider(context.extensionUri, folders, terminals);
  const sidebarRegistration = vscode.window.registerWebviewViewProvider(
    'terminalProjects.folders',
    sidebar
  );

  context.subscriptions.push(terminals, sidebar, sidebarRegistration);

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
      sidebar.expandFolder(folder.id);
      if (existing) {
        void vscode.window.showInformationMessage(`${folder.name} is already in Terminal Projects.`);
      }
      return folder;
    }),

    vscode.commands.registerCommand(
      'terminalProjects.addTerminal',
      async (node: string | undefined) => {
        const folderId = typeof node === 'string' ? node : undefined;
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
          sidebar.expandFolder(folder.id);
          const session = terminals.create(folder);
          terminals.select(session.id);
          sidebar.refresh();
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
      (value: string | undefined) => {
        const terminalId = typeof value === 'string' ? value : undefined;
        if (!terminalId || !terminals.get(terminalId)) {
          return;
        }
        terminals.select(terminalId);
        sidebar.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.renameTerminal',
      async (node: string | undefined) => {
        const terminalId = typeof node === 'string' ? node : undefined;
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
        sidebar.refresh();
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.killTerminal',
      async (node: string | undefined) => {
        const terminalId = typeof node === 'string' ? node : undefined;
        if (terminalId) {
          await terminals.kill(terminalId);
          sidebar.refresh();
        }
      }
    ),

    vscode.commands.registerCommand(
      'terminalProjects.removeFolder',
      async (node: string | undefined) => {
        const folderId = typeof node === 'string' ? node : undefined;
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
        sidebar.removeFolder(folder.id);
      }
    ),

    vscode.commands.registerCommand('terminalProjects.openSurface', () => {
      terminals.showSelected();
    }),

    vscode.commands.registerCommand('terminalProjects.refresh', () => sidebar.refresh())
  );
}

export function deactivate(): void {
  // VS Code disposes the subscriptions registered by activate, including managed terminals.
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
