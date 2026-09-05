import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { normalizeManagementName } from './managementName';
import type { StoredFolder } from './model';

const STORAGE_KEY = 'terminalProjects.folders.v1';

export class FolderStore {
  private folders: StoredFolder[];

  public constructor(private readonly state: vscode.Memento) {
    this.folders = this.readStoredFolders();
  }

  public list(): readonly StoredFolder[] {
    return this.folders;
  }

  public get(id: string): StoredFolder | undefined {
    return this.folders.find((folder) => folder.id === id);
  }

  public findByUri(uri: vscode.Uri): StoredFolder | undefined {
    const key = uri.toString();
    return this.folders.find((folder) => folder.uri === key);
  }

  public async add(uri: vscode.Uri): Promise<StoredFolder> {
    const existing = this.findByUri(uri);
    if (existing) {
      return existing;
    }

    const folder: StoredFolder = {
      id: randomUUID(),
      name: path.basename(uri.fsPath) || uri.fsPath,
      uri: uri.toString()
    };

    this.folders = [...this.folders, folder];
    await this.persist();
    return folder;
  }

  public async remove(id: string): Promise<void> {
    this.folders = this.folders.filter((folder) => folder.id !== id);
    await this.persist();
  }

  public async rename(id: string, name: string): Promise<StoredFolder | undefined> {
    const folder = this.get(id);
    const normalized = normalizeManagementName(name);
    if (!folder || !normalized) {
      return undefined;
    }

    const renamed: StoredFolder = { ...folder, name: normalized };
    this.folders = this.folders.map((candidate) =>
      candidate.id === id ? renamed : candidate
    );
    await this.persist();
    return renamed;
  }

  private readStoredFolders(): StoredFolder[] {
    const value = this.state.get<unknown>(STORAGE_KEY, []);
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const result: StoredFolder[] = [];
    for (const entry of value) {
      if (!isStoredFolder(entry) || seen.has(entry.uri)) {
        continue;
      }
      seen.add(entry.uri);
      result.push(entry);
    }
    return result;
  }

  private async persist(): Promise<void> {
    await this.state.update(STORAGE_KEY, this.folders);
  }
}

function isStoredFolder(value: unknown): value is StoredFolder {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StoredFolder>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.name === 'string' &&
    candidate.name.length > 0 &&
    typeof candidate.uri === 'string' &&
    candidate.uri.length > 0
  );
}
