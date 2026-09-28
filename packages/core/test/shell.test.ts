import { describe, expect, it } from 'vitest';
import { resolveDefaultShell, adaptShellCommand } from '../src/shell.js';

describe('Cross-platform shell utility', () => {
  it('resolves default shell appropriately for platform', () => {
    const shell = resolveDefaultShell();
    if (process.platform === 'win32') {
      // Should be Git bash string if installed, or boolean true
      expect(typeof shell === 'string' || typeof shell === 'boolean').toBe(true);
    } else {
      expect(shell).toBe(true);
    }
  });

  it('adapts POSIX test -s command for Windows cmd.exe', () => {
    const original = 'test -s docs/spikes/spike-nhom-1-raw-output.md';
    if (process.platform === 'win32') {
      const adapted = adaptShellCommand(original, true);
      expect(adapted).toContain('node -e');
      expect(adapted).toContain('fs.existsSync');
      expect(adapted).toContain('size > 0');
    }
  });

  it('adapts POSIX test -f command for Windows cmd.exe', () => {
    const original = 'test -f package.json';
    if (process.platform === 'win32') {
      const adapted = adaptShellCommand(original, true);
      expect(adapted).toContain('node -e');
      expect(adapted).toContain('fs.existsSync');
    }
  });

  it('adapts POSIX grep -q command for Windows cmd.exe', () => {
    const original = 'grep -q "squad" package.json';
    if (process.platform === 'win32') {
      const adapted = adaptShellCommand(original, true);
      expect(adapted).toContain('node -e');
      expect(adapted).toContain('includes');
    }
  });

  it('keeps normal commands intact', () => {
    const normalCmd = 'pnpm test';
    expect(adaptShellCommand(normalCmd, true)).toBe('pnpm test');
  });

  it('preserves POSIX commands when a custom POSIX shell path is used', () => {
    const original = 'test -s docs/spikes/spike-nhom-1-raw-output.md';
    expect(adaptShellCommand(original, 'C:\\Program Files\\Git\\bin\\bash.exe')).toBe(original);
  });
});
