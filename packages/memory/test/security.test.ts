import { describe, it, expect } from 'vitest';
import { validateIdentifier, InvalidIdentifierError } from '../src/index.js';

describe('Security: validateIdentifier', () => {
  it('allows valid alphanumeric identifiers with hyphens and underscores', () => {
    expect(validateIdentifier('task-123', 'taskId')).toBe('task-123');
    expect(validateIdentifier('frontend_role', 'role')).toBe('frontend_role');
    expect(validateIdentifier('Architecture-2026', 'name')).toBe('Architecture-2026');
    expect(validateIdentifier('worker_agent_01', 'role')).toBe('worker_agent_01');
  });

  it('rejects path traversal attempts such as ../roles/pm', () => {
    expect(() => validateIdentifier('../roles/pm', 'role')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('../../task-1', 'taskId')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('nested/dir', 'taskId')).toThrowError(InvalidIdentifierError);
  });

  it('rejects empty or whitespace-only strings', () => {
    expect(() => validateIdentifier('', 'taskId')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('   ', 'role')).toThrowError(InvalidIdentifierError);
    // @ts-expect-error testing invalid type
    expect(() => validateIdentifier(null, 'taskId')).toThrowError(InvalidIdentifierError);
  });

  it('rejects characters not matching whitelist [A-Za-z0-9_-], such as colon a:b', () => {
    expect(() => validateIdentifier('a:b', 'taskId')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('task.name', 'taskId')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('role@squad', 'role')).toThrowError(InvalidIdentifierError);
    expect(() => validateIdentifier('task$01', 'taskId')).toThrowError(InvalidIdentifierError);
  });

  it('rejects Windows reserved device names (CON, NUL, PRN, AUX, COM1, LPT1)', () => {
    const reservedNames = ['CON', 'con', 'NUL', 'nul', 'PRN', 'AUX', 'COM1', 'com9', 'LPT1', 'lpt9'];
    for (const name of reservedNames) {
      expect(() => validateIdentifier(name, 'taskId')).toThrowError(InvalidIdentifierError);
      expect(() => validateIdentifier(name, 'taskId')).toThrowError(/Windows reserved device name/);
    }
  });
});
