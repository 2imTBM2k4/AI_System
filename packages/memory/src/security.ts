/**
 * Custom error thrown when an identifier (taskId, role, slug) fails security validation.
 */
export class InvalidIdentifierError extends Error {
  constructor(message: string, public readonly identifier?: string) {
    const formatted = identifier ? `[Security] ${message}: '${identifier}'` : `[Security] ${message}`;
    super(formatted);
    this.name = 'InvalidIdentifierError';
  }
}

/**
 * Whitelist pattern for task, role, and document slug identifiers:
 * Only ASCII alphanumeric characters, underscores, and hyphens are allowed.
 */
const IDENTIFIER_WHITELIST_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Windows reserved device names that cannot be used as filenames or path components.
 */
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * Validates a taskId, role, or name identifier against strict security rules:
 * 1. Must be a non-empty string.
 * 2. Must only contain characters from whitelist [A-Za-z0-9_-].
 * 3. Must not match Windows reserved device names (CON, NUL, AUX, PRN, COM1-9, LPT1-9).
 *
 * NOTE: While `resolveSafePath` protects against filesystem-level root escapes (path traversal
 * and symlink escapes), `validateIdentifier` enforces business-domain identifier cleanliness
 * and operating-system device name protection before constructing filesystem paths.
 *
 * @param id - The identifier string to validate.
 * @param fieldName - Name of the field for error reporting (e.g. 'taskId', 'role', 'name').
 * @throws InvalidIdentifierError if validation fails.
 */
export function validateIdentifier(id: unknown, fieldName: 'taskId' | 'role' | 'name'): string {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new InvalidIdentifierError(`${fieldName} must be a non-empty string`, String(id));
  }

  const trimmed = id.trim();

  // Check character whitelist
  if (!IDENTIFIER_WHITELIST_REGEX.test(trimmed)) {
    throw new InvalidIdentifierError(
      `${fieldName} contains invalid characters; must match whitelist [A-Za-z0-9_-]`,
      trimmed
    );
  }

  // Check Windows reserved device names (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(upper)) {
    throw new InvalidIdentifierError(
      `${fieldName} cannot use Windows reserved device name`,
      trimmed
    );
  }

  return trimmed;
}
