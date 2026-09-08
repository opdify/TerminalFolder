import { execFile } from 'node:child_process';
import { readlink, realpath } from 'node:fs/promises';
import * as path from 'node:path';

export async function resolveProcessWorkingDirectory(
  processId: number
): Promise<string | undefined> {
  if (!Number.isInteger(processId) || processId <= 0) {
    return undefined;
  }

  if (process.platform === 'linux') {
    try {
      return await readlink(`/proc/${processId}/cwd`);
    } catch {
      return undefined;
    }
  }

  if (process.platform === 'darwin') {
    const output = await executeText('/usr/sbin/lsof', [
      '-a',
      '-p',
      String(processId),
      '-d',
      'cwd',
      '-Fn'
    ]);
    return output ? parseLsofWorkingDirectory(output) : undefined;
  }

  return undefined;
}

export function parseLsofWorkingDirectory(output: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('n') && line.length > 1) {
      return line.slice(1);
    }
  }
  return undefined;
}

export async function pathsReferToSameDirectory(
  left: string,
  right: string
): Promise<boolean> {
  if (normalizedPath(left) === normalizedPath(right)) {
    return true;
  }
  try {
    const [resolvedLeft, resolvedRight] = await Promise.all([
      realpath(left),
      realpath(right)
    ]);
    return normalizedPath(resolvedLeft) === normalizedPath(resolvedRight);
  } catch {
    return false;
  }
}

function executeText(file: string, arguments_: readonly string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      file,
      arguments_,
      { encoding: 'utf8', timeout: 2_000 },
      (error, stdout) => resolve(error ? undefined : stdout)
    );
  });
}

function normalizedPath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
