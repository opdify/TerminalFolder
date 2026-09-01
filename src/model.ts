import type { IPty } from 'node-pty';

export interface StoredFolder {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export type TerminalStatus = 'running' | 'exited';

export interface TerminalSession {
  readonly id: string;
  readonly folderId: string;
  name: string;
  status: TerminalStatus;
  exitCode?: number;
  readonly createdAt: number;
  readonly output: OutputBuffer;
  pty?: IPty;
}

export interface TerminalSnapshot {
  readonly id: string;
  readonly folderId: string;
  readonly folderName: string;
  readonly name: string;
  readonly status: TerminalStatus;
  readonly exitCode?: number;
  readonly history: string;
}

/**
 * A bounded raw stream used only to rebuild a webview that was closed.
 * While the webview is alive, xterm.js owns the richer line-oriented scrollback.
 */
export class OutputBuffer {
  private chunks: string[] = [];
  private size = 0;

  public constructor(private readonly limit: number) {}

  public append(data: string): void {
    if (!data || this.limit <= 0) {
      return;
    }

    if (data.length >= this.limit) {
      this.chunks = [data.slice(-this.limit)];
      this.size = this.chunks[0]?.length ?? 0;
      return;
    }

    this.chunks.push(data);
    this.size += data.length;

    while (this.size > this.limit && this.chunks.length > 0) {
      const overflow = this.size - this.limit;
      const first = this.chunks[0];
      if (first === undefined) {
        break;
      }

      if (first.length <= overflow) {
        this.chunks.shift();
        this.size -= first.length;
      } else {
        this.chunks[0] = first.slice(overflow);
        this.size -= overflow;
      }
    }
  }

  public toString(): string {
    return this.chunks.join('');
  }

  public clear(): void {
    this.chunks = [];
    this.size = 0;
  }

  public get length(): number {
    return this.size;
  }
}

export function clampTerminalDimensions(
  cols: number,
  rows: number
): { cols: number; rows: number } | undefined {
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
    return undefined;
  }

  return {
    cols: Math.max(2, Math.min(1000, Math.floor(cols))),
    rows: Math.max(1, Math.min(1000, Math.floor(rows)))
  };
}
