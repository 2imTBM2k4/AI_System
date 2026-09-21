#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as pathResolve } from 'node:path';
import { homedir } from 'node:os';

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: 'cx/gpt-5.4-mini' },
    prompt: { type: 'string' },
  },
  allowPositionals: true,
  strict: false,
});

const model = values.model;
const prompt = values.prompt || '';

const baseUrl = (process.env.OPENAI_BASE_URL || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
let apiKey = process.env.OPENAI_API_KEY || '';

if (!apiKey || apiKey === 'sk-9router') {
  try {
    const pPath = pathResolve(homedir(), '.squad', 'providers.json');
    const content = await readFile(pPath, 'utf8');
    const provs = JSON.parse(content);
    const nr = provs.find((p) => p.id === '9router');
    if (nr?.apiKey && !nr.apiKey.includes('***')) {
      apiKey = nr.apiKey;
    }
  } catch {}
}
if (!apiKey) apiKey = 'sk-9router';

const endpoint = baseUrl.endsWith('/chat/completions')
  ? baseUrl
  : baseUrl.endsWith('/v1')
  ? `${baseUrl}/chat/completions`
  : `${baseUrl}/v1/chat/completions`;

const fileFormatInstruction = `\n\n[FILE FORMAT RULES]
If you create, edit, or update any files, you MUST output each file using this format:
FILE: path/to/file.ext
\`\`\`language
<complete code>
\`\`\`
Always output the full file content without truncation.`;

const enhancedPrompt = prompt.includes('FILE:') ? prompt : `${prompt}${fileFormatInstruction}`;

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: enhancedPrompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    let errBody = '';
    try {
      errBody = await response.text();
    } catch {}
    console.error(`[9Router/OpenRouter Error] HTTP ${response.status} ${response.statusText}: ${errBody}`);
    process.exit(1);
  }

  const rawText = await response.text();
  let content = '';

  // Check if SSE Stream (data: {...})
  const trimmedText = rawText.trim();
  if (trimmedText.startsWith('data:') || trimmedText.includes('\ndata:')) {
    const lines = trimmedText.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonPart = trimmed.slice(5).trim();
      if (jsonPart === '[DONE]' || !jsonPart) continue;
      try {
        const parsed = JSON.parse(jsonPart);
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.text || '';
        if (delta) content += delta;
      } catch {}
    }
  } else {
    try {
      const parsed = JSON.parse(trimmedText);
      content = parsed?.choices?.[0]?.message?.content || parsed?.choices?.[0]?.text || '';
    } catch {
      content = trimmedText;
    }
  }

  process.stdout.write(content);

  // Extract and write any generated files to disk in process.cwd()
  const written = await extractAndWriteFiles(content, process.cwd());
  for (const w of written) {
    process.stdout.write(`\n[squad:write] Updated ${w.path} (${w.bytes} bytes)\n`);
  }
} catch (error) {
  console.error(`[9Router/OpenRouter Connection Error]:`, error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function extractAndWriteFiles(text, cwd) {
  const written = [];

  // Helper to safely write
  const safeWrite = async (rawPath, code) => {
    let normalized = rawPath.replace(/\\/g, '/').replace(/^\.?\/+/, '').trim();
    if (!normalized || normalized.includes('..') || isAbsolute(normalized)) {
      return;
    }
    const fullPath = pathResolve(cwd, normalized);
    if (!fullPath.startsWith(pathResolve(cwd))) {
      return;
    }
    if (written.some((w) => w.path === normalized)) {
      return;
    }
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, code, 'utf8');
    written.push({ path: normalized, bytes: Buffer.byteLength(code) });
  };

  // Pattern 1: FILE: path/to/file.ext\n```lang\ncode\n```
  const fileMarkerRegex = /(?:FILE|File|file):\s*[`"']?([^\r\n`"']+\.[a-zA-Z0-9_\-]+)[`"']?\s*\r?\n```[a-zA-Z0-9_\-]*\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = fileMarkerRegex.exec(text)) !== null) {
    await safeWrite(match[1], match[2]);
  }

  // Pattern 2: Markdown heading followed by code block: ### 1. path/to/file.ext\n```lang\ncode\n```
  const headingRegex = /###?\s*(?:\d+\.\s*)?(?:File:\s*)?[`"']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9_\-]+)[`"']?\s*\r?\n```[a-zA-Z0-9_\-]*\r?\n([\s\S]*?)```/g;
  while ((match = headingRegex.exec(text)) !== null) {
    await safeWrite(match[1], match[2]);
  }

  // Pattern 3: Comment inside code block: ```lang\n// filepath: path/to/file.ext\ncode\n```
  const commentRegex = /```[a-zA-Z0-9_\-]*\r?\n(?:\/\/|#|\/\*)\s*(?:filepath|file):\s*[`"']?([^\r\n`"']+\.[a-zA-Z0-9_\-]+)[`"']?(?:\s*\*\/)?\r?\n([\s\S]*?)```/g;
  while ((match = commentRegex.exec(text)) !== null) {
    await safeWrite(match[1], match[2]);
  }

  return written;
}
