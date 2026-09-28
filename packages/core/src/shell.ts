import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolves the appropriate shell executable. On Windows, if Git Bash is found,
 * it returns Git Bash path so POSIX commands (test, grep, rm, etc.) work transparently.
 */
export function resolveDefaultShell(): string | boolean {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      process.env.LOCALAPPDATA ? resolve(process.env.LOCALAPPDATA, 'Programs\\Git\\bin\\bash.exe') : '',
    ];
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return true;
}

/**
 * Adapts common POSIX file-test and pattern-matching commands when running under Windows cmd.exe.
 */
export function adaptShellCommand(command: string, shell: string | boolean): string {
  if (process.platform !== 'win32' || typeof shell === 'string') {
    return command;
  }
  const trimmed = command.trim();
  // test -s <file> -> node check file exists and size > 0
  const testSizeMatch = trimmed.match(/^test\s+-s\s+["']?([^"';&|]+)["']?$/);
  if (testSizeMatch) {
    const targetFile = testSizeMatch[1].replace(/\\/g, '/');
    return `node -e "const fs = require('fs'); const p = process.argv[1]; process.exit(fs.existsSync(p) && fs.statSync(p).size > 0 ? 0 : 1)" "${targetFile}"`;
  }
  // test -f <file> or test -e <file> -> node check file exists
  const testFileMatch = trimmed.match(/^test\s+-[fe]\s+["']?([^"';&|]+)["']?$/);
  if (testFileMatch) {
    const targetFile = testFileMatch[1].replace(/\\/g, '/');
    return `node -e "const fs = require('fs'); const p = process.argv[1]; process.exit(fs.existsSync(p) ? 0 : 1)" "${targetFile}"`;
  }
  // grep -q <pattern> <file> -> node check file contains pattern
  const grepMatch = trimmed.match(/^grep\s+-q\s+["']?([^"';&|]+)["']?\s+["']?([^"';&|]+)["']?$/);
  if (grepMatch) {
    const pattern = grepMatch[1];
    const targetFile = grepMatch[2].replace(/\\/g, '/');
    return `node -e "const fs = require('fs'); const [,,q,f] = process.argv; process.exit(fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(q) ? 0 : 1)" "${pattern}" "${targetFile}"`;
  }
  return command;
}
