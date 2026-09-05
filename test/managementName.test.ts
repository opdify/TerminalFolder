import { describe, expect, it } from 'vitest';
import { normalizeManagementName } from '../src/managementName';

describe('normalizeManagementName', () => {
  it('trims a folder or terminal name', () => {
    expect(normalizeManagementName('  Claude backend  ')).toBe('Claude backend');
  });

  it('rejects an empty management name', () => {
    expect(normalizeManagementName('   ')).toBeUndefined();
  });
});
