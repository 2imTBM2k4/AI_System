import { describe, it, expect } from 'vitest';
import { parseMemory, serializeMemory, MemoryDoc, MemoryParseError } from '../src/index.js';

describe('parser / serializer (T1)', () => {
  const sampleDoc: MemoryDoc = {
    frontmatter: {
      name: 'architecture-decisions',
      description: 'Chứa các quyết định kiến trúc dài hạn cho squad',
      scope: 'project',
      updatedAt: '2026-09-28T10:00:00.000Z',
      updatedBy: 'gemini-agent',
    },
    content: '\n- Quyết định 1: Dùng SQLite cho local persistence\n- Quyết định 2: Hỗ trợ tiếng Việt UTF-8 và emoji 🚀\n',
  };

  it('serializes and parses round-trip preserving content and frontmatter', () => {
    const raw = serializeMemory(sampleDoc);
    const parsed = parseMemory(raw);

    expect(parsed.frontmatter).toEqual(sampleDoc.frontmatter);
    expect(parsed.content.trim()).toBe(sampleDoc.content.trim());

    // Second round-trip
    const reSerialized = serializeMemory(parsed);
    const reParsed = parseMemory(reSerialized);
    expect(reParsed).toEqual(parsed);
  });

  it('supports all valid memory scopes: project, role, task', () => {
    for (const scope of ['project', 'role', 'task'] as const) {
      const doc: MemoryDoc = {
        frontmatter: {
          name: `test-${scope}`,
          description: `Test description for ${scope}`,
          scope,
          updatedAt: new Date().toISOString(),
          updatedBy: 'tester',
        },
        content: `\n- Fact for ${scope}\n`,
      };

      const raw = serializeMemory(doc);
      const parsed = parseMemory(raw);
      expect(parsed.frontmatter.scope).toBe(scope);
    }
  });

  it('preserves Vietnamese unicode characters and emojis', () => {
    const doc: MemoryDoc = {
      frontmatter: {
        name: 'bai-hoc-kinh-nghiem',
        description: 'Bài học kinh nghiệm: Không tự giả định khi thiếu thông tin 🎯',
        scope: 'role',
        updatedAt: '2026-09-28T12:30:00.000Z',
        updatedBy: 'claude-3-5-sonnet',
      },
      content: '\n- Bài học 1: Tiếng Việt có dấu: Cần cù bù thông minh 🇻🇳\n- Bài học 2: Đặc tả rõ ràng các ca biên.\n',
    };

    const raw = serializeMemory(doc);
    const parsed = parseMemory(raw);
    expect(parsed.frontmatter.description).toBe(doc.frontmatter.description);
    expect(parsed.content).toContain('Cần cù bù thông minh 🇻🇳');
  });

  it('throws MemoryParseError with file path when frontmatter block is missing', () => {
    const invalidRaw = '# Just markdown without frontmatter\n\n- Fact 1';
    expect(() => parseMemory(invalidRaw, 'path/to/invalid.md')).toThrowError(MemoryParseError);
    expect(() => parseMemory(invalidRaw, 'path/to/invalid.md')).toThrowError(/\[path\/to\/invalid\.md\]/);
  });

  it('throws MemoryParseError on malformed YAML syntax', () => {
    const badYaml = '---\nname: [unclosed array\ndescription: test\n---\nContent';
    expect(() => parseMemory(badYaml, 'broken.md')).toThrowError(MemoryParseError);
    expect(() => parseMemory(badYaml, 'broken.md')).toThrowError(/Failed to parse frontmatter YAML/);
  });

  it('throws when required fields are missing', () => {
    const missingName = `---
description: Missing name
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(missingName)).toThrowError(/missing or invalid required field: 'name'/);

    const missingScope = `---
name: test
description: Missing scope
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(missingScope)).toThrowError(/missing or invalid 'scope'/);

    const invalidScope = `---
name: test
description: Invalid scope
scope: unknown-scope
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(invalidScope)).toThrowError(/expected one of \[project, role, task\]/);

    const invalidDate = `---
name: test
description: Invalid date
scope: project
updatedAt: not-a-date
updatedBy: agent
---
Content`;
    expect(() => parseMemory(invalidDate)).toThrowError(/must be a valid ISO 8601 date string/);
  });

  it('handles empty content and trims facts properly', () => {
    const doc: MemoryDoc = {
      frontmatter: {
        name: 'empty-doc',
        description: 'Doc with empty body',
        scope: 'project',
        updatedAt: '2026-09-28T00:00:00.000Z',
        updatedBy: 'system',
      },
      content: '',
    };
    const serialized = serializeMemory(doc);
    const parsed = parseMemory(serialized);
    expect(parsed.frontmatter.name).toBe('empty-doc');
    expect(parsed.content.trim()).toBe('');
  });

  it('throws MemoryParseError if input is not a string', () => {
    // @ts-expect-error testing invalid type
    expect(() => parseMemory(null)).toThrowError(MemoryParseError);
    // @ts-expect-error testing invalid type
    expect(() => parseMemory(undefined)).toThrowError(MemoryParseError);
  });
});
