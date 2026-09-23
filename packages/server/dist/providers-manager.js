import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { getAgentPromptCandidates, loadSquadConfig, parseSquadConfig, } from '@squad/core';
import { squadHome } from './registry.js';
const PROVIDERS_FILE = 'providers.json';
export const DEFAULT_PROVIDERS = [
    {
        id: '9router',
        name: '9Router Gateway (Local)',
        enabled: true,
        baseUrl: 'http://127.0.0.1:20128',
        apiKey: '',
        customModels: [],
    },
    {
        id: 'anthropic',
        name: 'Anthropic (Claude Code / API)',
        enabled: false,
        baseUrl: 'https://api.anthropic.com',
        apiKey: '',
        customModels: [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI (Codex / API)',
        enabled: false,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: '',
        customModels: [
            'gpt-4o',
            'gpt-4o-mini',
            'o1',
            'o3-mini',
        ],
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        enabled: false,
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: '',
        customModels: [
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-1.5-pro',
        ],
    },
    {
        id: 'custom',
        name: 'Custom OpenAI-Compatible (DeepSeek / OpenRouter)',
        enabled: false,
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: '',
        customModels: [
            'deepseek-chat',
            'deepseek-reasoner',
        ],
    },
];
export function maskApiKey(key) {
    if (!key || key.trim().length === 0)
        return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8)
        return '****';
    return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}
export class ProvidersManager {
    home;
    providersPath;
    constructor(home = squadHome()) {
        this.home = home;
        this.providersPath = join(this.home, PROVIDERS_FILE);
    }
    async getProviders(mask = true) {
        try {
            const content = await readFile(this.providersPath, 'utf8');
            const loaded = JSON.parse(content);
            return loaded.map((p) => (mask ? { ...p, apiKey: maskApiKey(p.apiKey) } : p));
        }
        catch {
            // File chưa có, trả về template mặc định
            return DEFAULT_PROVIDERS.map((p) => mask ? { ...p, apiKey: maskApiKey(p.apiKey) } : p);
        }
    }
    async saveProviders(incoming) {
        await mkdir(this.home, { recursive: true });
        // Lấy secret keys cũ để không bị đè bởi masked string
        let currentRaw = [];
        try {
            const content = await readFile(this.providersPath, 'utf8');
            currentRaw = JSON.parse(content);
        }
        catch {
            currentRaw = DEFAULT_PROVIDERS;
        }
        const currentKeyMap = new Map();
        for (const p of currentRaw) {
            if (p.apiKey)
                currentKeyMap.set(p.id, p.apiKey);
        }
        const toSave = incoming.map((p) => {
            let finalKey = p.apiKey?.trim() || '';
            // Nếu key gửi lên là masked (chứa '***'), giữ lại key gốc
            if (finalKey.includes('***')) {
                finalKey = currentKeyMap.get(p.id) || '';
            }
            return {
                ...p,
                apiKey: finalKey,
            };
        });
        await writeFile(this.providersPath, JSON.stringify(toSave, null, 2), 'utf8');
        return toSave.map((p) => ({ ...p, apiKey: maskApiKey(p.apiKey) }));
    }
    async testConnection(req) {
        const startTime = Date.now();
        let baseUrl = req.baseUrl?.trim();
        let apiKey = req.apiKey?.trim();
        // Nếu key là masked, load key thật từ đĩa
        if (!apiKey || apiKey.includes('***')) {
            const rawProviders = await this.getProviders(false);
            const found = rawProviders.find((p) => p.id === req.providerId);
            if (found?.apiKey)
                apiKey = found.apiKey;
            if (!baseUrl && found?.baseUrl)
                baseUrl = found.baseUrl;
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            let targetUrl = '';
            const headers = {
                'Content-Type': 'application/json',
            };
            if (req.providerId === '9router' || req.providerId === 'openai' || req.providerId === 'custom') {
                const cleanBase = (baseUrl || 'http://127.0.0.1:20128').replace(/\/+$/, '');
                targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
                if (apiKey) {
                    headers['Authorization'] = `Bearer ${apiKey}`;
                }
            }
            else if (req.providerId === 'anthropic') {
                const cleanBase = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
                targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
                if (apiKey) {
                    headers['x-api-key'] = apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                }
            }
            else if (req.providerId === 'gemini') {
                targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey || ''}`;
            }
            else {
                const cleanBase = (baseUrl || 'http://127.0.0.1:20128').replace(/\/+$/, '');
                targetUrl = cleanBase.endsWith('/v1') ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
                if (apiKey)
                    headers['Authorization'] = `Bearer ${apiKey}`;
            }
            const response = await fetch(targetUrl, {
                headers,
                signal: controller.signal,
            });
            clearTimeout(timer);
            const latencyMs = Date.now() - startTime;
            if (!response.ok) {
                let errDetail = `HTTP ${response.status} ${response.statusText}`;
                try {
                    const errBody = await response.json();
                    if (errBody?.error?.message)
                        errDetail = errBody.error.message;
                }
                catch { }
                return {
                    success: false,
                    latencyMs,
                    models: [],
                    error: errDetail,
                };
            }
            const json = await response.json();
            const models = [];
            if (Array.isArray(json?.data)) {
                for (const item of json.data) {
                    if (typeof item?.id === 'string')
                        models.push(item.id);
                }
            }
            else if (Array.isArray(json?.models)) {
                for (const item of json.models) {
                    if (typeof item?.name === 'string') {
                        models.push(item.name.replace(/^models\//, ''));
                    }
                }
            }
            return {
                success: true,
                latencyMs,
                models: models.length > 0 ? models : (DEFAULT_PROVIDERS.find((p) => p.id === req.providerId)?.customModels || []),
            };
        }
        catch (error) {
            return {
                success: false,
                latencyMs: Date.now() - startTime,
                models: [],
                error: error instanceof Error ? error.message : 'Không thể kết nối đến provider',
            };
        }
    }
    async getRepoConfig(repoPath) {
        const configPath = resolve(repoPath, 'squad.config.json');
        const loaded = await loadSquadConfig(configPath);
        return loaded.config;
    }
    async updateRepoConfig(repoPath, newConfig) {
        const validated = parseSquadConfig(newConfig);
        const configPath = resolve(repoPath, 'squad.config.json');
        await writeFile(configPath, JSON.stringify(validated, null, 2), 'utf8');
        return validated;
    }
    getDefaultAgentMarkdown(role) {
        const roleName = role.toUpperCase();
        return `---
cli: codex
model: 
duty: Chuyên viên ${role} phụ trách xử lý và thực thi task
description: Agent phụ trách vai trò ${role} trong squad
---

# Hướng dẫn nghiệp vụ cho Agent (${roleName})

## Mục tiêu
Đảm bảo các yêu cầu liên quan đến vai trò ${role} được thực thi chuẩn xác, sạch sẽ và tuân thủ cấu trúc của dự án.

## Quy tắc thực hiện
1. Đọc kỹ yêu cầu công việc được giao trong prompt.
2. Kiểm tra các file liên quan trước khi sửa đổi.
3. Chạy kiểm thử tự động (test / lint) sau khi chỉnh sửa code.
4. Báo cáo chi tiết kết quả thực hiện.
`;
    }
    async getAgentMarkdownFile(repoPath, role) {
        let customPromptFile;
        try {
            const config = await this.getRepoConfig(repoPath);
            customPromptFile = config.agents[role]?.promptFile;
        }
        catch {
            // Squad config might not exist or role not defined
        }
        const candidatePaths = getAgentPromptCandidates(role, customPromptFile);
        for (const candidate of candidatePaths) {
            const absPath = resolve(repoPath, candidate);
            try {
                const content = await readFile(absPath, 'utf8');
                return {
                    role,
                    filePath: candidate,
                    exists: true,
                    content,
                    candidatePaths,
                };
            }
            catch (error) {
                if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
                    // Ignore ENOENT and try next
                }
            }
        }
        // None found; return starter template with standard agent_<role>.md filename
        const defaultFilePath = `agent_${role}.md`;
        return {
            role,
            filePath: defaultFilePath,
            exists: false,
            content: this.getDefaultAgentMarkdown(role),
            candidatePaths,
        };
    }
    async saveAgentMarkdownFile(repoPath, role, content, targetFilePath) {
        const relativePath = targetFilePath?.trim() || `agent_${role}.md`;
        const absPath = resolve(repoPath, relativePath);
        // Ensure directory exists if path has subdirectories
        await mkdir(dirname(absPath), { recursive: true });
        await writeFile(absPath, content, 'utf8');
        return {
            role,
            filePath: relativePath,
            saved: true,
        };
    }
}
//# sourceMappingURL=providers-manager.js.map