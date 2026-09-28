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

  it('parses unquoted ISO updatedAt timestamps accurately', () => {
    const rawUnquotedDate = `---
name: unquoted-date-test
description: Testing unquoted YAML timestamp
scope: task
updatedAt: 2026-09-28T10:00:00.000Z
updatedBy: worker
---
- Step completed
`;
    const doc = parseMemory(rawUnquotedDate);
    expect(doc.frontmatter.updatedAt).toBe('2026-09-28T10:00:00.000Z');
  });

  it('parses content with Windows CRLF (\\r\\n) line endings without error', () => {
    const rawCrlf = '---\r\nname: crlf-test\r\ndescription: CRLF test\r\nscope: project\r\nupdatedAt: "2026-09-28T10:00:00.000Z"\r\nupdatedBy: win-agent\r\n---\r\n- Line 1 with CRLF\r\n- Line 2 with CRLF\r\n';
    const doc = parseMemory(rawCrlf);
    expect(doc.frontmatter.name).toBe('crlf-test');
    expect(doc.content).toContain('Line 1 with CRLF');
    expect(doc.content).toContain('Line 2 with CRLF');
  });

  it('strips UTF-8 BOM (\\uFEFF) character seamlessly', () => {
    const rawWithBom = '\uFEFF---\nname: bom-test\ndescription: BOM test\nscope: project\nupdatedAt: "2026-09-28T10:00:00.000Z"\nupdatedBy: agent\n---\n- Fact after BOM\n';
    const doc = parseMemory(rawWithBom);
    expect(doc.frontmatter.name).toBe('bom-test');
    expect(doc.content).toContain('Fact after BOM');
  });

  it('preserves horizontal rule "---" dividers inside markdown body without corrupting frontmatter', () => {
    const rawWithBodyDashes = `---
name: body-dashes-test
description: Body containing dashes
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---

Section 1 facts:
- Item 1

---

Section 2 facts:
- Item 2
`;
    const doc = parseMemory(rawWithBodyDashes);
    expect(doc.frontmatter.name).toBe('body-dashes-test');
    expect(doc.content).toContain('Section 1 facts:');
    expect(doc.content).toContain('---');
    expect(doc.content).toContain('Section 2 facts:');
  });

  it('ensures immutability and consistent results when parsed multiple times', () => {
    const raw = `---
name: multi-parse-test
description: Consistency test
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
- Content
`;
    const doc1 = parseMemory(raw);
    const doc2 = parseMemory(raw);

    expect(doc1).toEqual(doc2);
    expect(doc1).not.toBe(doc2); // Different object instances

    // Mutating doc1 does not affect doc2
    doc1.frontmatter.name = 'mutated';
    expect(doc2.frontmatter.name).toBe('multi-parse-test');
  });

  it('rejects invalid data types for frontmatter fields (number, boolean, array)', () => {
    const numericName = `---
name: 12345
description: Test
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(numericName)).toThrowError(/'name' must be a non-empty string/);

    const booleanDesc = `---
name: test
description: true
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(booleanDesc)).toThrowError(/'description' must be a string/);

    const arrayUpdatedBy = `---
name: test
description: Test
scope: project
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: [agent1, agent2]
---
Content`;
    expect(() => parseMemory(arrayUpdatedBy)).toThrowError(/'updatedBy' must be a non-empty string/);
  });

  it('throws error consistently when parsing the same corrupted YAML multiple times', () => {
    const corruptYaml = '---\nname: [unclosed\ndescription: corrupt\n---\nBody';
    expect(() => parseMemory(corruptYaml, 'corrupt.md')).toThrowError(MemoryParseError);
    expect(() => parseMemory(corruptYaml, 'corrupt.md')).toThrowError(MemoryParseError);
  });

  it('strictly validates ISO 8601 date format and rejects invalid or non-ISO dates', () => {
    // Month 13, Day 45
    const month13Day45 = `---
name: bad-date-1
description: Test
scope: project
updatedAt: "2026-13-45"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(month13Day45)).toThrowError(/must be a valid ISO 8601 date string/);

    // Natural language date "Sep 28 2026"
    const naturalDate = `---
name: bad-date-2
description: Test
scope: project
updatedAt: "Sep 28 2026"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(naturalDate)).toThrowError(/must be a valid ISO 8601 date string/);

    // Date without time component
    const dateOnly = `---
name: bad-date-3
description: Test
scope: project
updatedAt: "2026-09-28"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(dateOnly)).toThrowError(/must be a valid ISO 8601 date string/);
  });

  it('rejects invalid scope values', () => {
    const badScope1 = `---
name: bad-scope
description: Test
scope: global
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(badScope1)).toThrowError(/expected one of \[project, role, task\]/);

    const numericScope = `---
name: bad-scope-2
description: Test
scope: 12345
updatedAt: "2026-09-28T10:00:00.000Z"
updatedBy: agent
---
Content`;
    expect(() => parseMemory(numericScope)).toThrowError(/expected one of \[project, role, task\]/);
  });
});
