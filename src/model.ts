export interface StoredFolder {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export type TerminalStatus = 'running' | 'exited';
