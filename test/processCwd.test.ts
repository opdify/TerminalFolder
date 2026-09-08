import { describe, expect, it } from 'vitest';
import { parseLsofWorkingDirectory, pathsReferToSameDirectory } from '../src/processCwd';

describe('parseLsofWorkingDirectory', () => {
  it('extracts the cwd name record from lsof field output', () => {
    expect(parseLsofWorkingDirectory('p123\nfcwd\nn/tmp/project\n')).toBe(
      '/tmp/project'
    );
  });

  it('returns undefined when lsof did not report a cwd', () => {
    expect(parseLsofWorkingDirectory('p123\n')).toBeUndefined();
  });
});

describe('pathsReferToSameDirectory', () => {
  it('accepts normalized forms of the same directory', async () => {
    await expect(pathsReferToSameDirectory('/tmp/project/..', '/tmp')).resolves.toBe(
      true
    );
  });
});
