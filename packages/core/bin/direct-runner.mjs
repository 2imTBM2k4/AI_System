#!/usr/bin/env node
import { parseArgs } from 'node:util';

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

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve as pathResolve } from 'node:path';

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

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
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

  // Kiểm tra nếu là SSE Stream (data: {...})
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
} catch (error) {
  console.error(`[9Router/OpenRouter Connection Error]:`, error instanceof Error ? error.message : String(error));
  process.exit(1);
}
