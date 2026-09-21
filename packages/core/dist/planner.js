import { z } from 'zod';
import { runGit } from './git.js';
export class PlanError extends Error {
    code = 'PLAN_INVALID';
    constructor(message, options) {
        super(message, options);
        this.name = 'PlanError';
    }
}
export const PlanTaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    role: z.string(),
    files: z.array(z.string()).default([]),
    dependsOn: z.array(z.string()).default([]),
    prompt: z.string(),
    verify: z.string().optional(),
    branch: z.string().optional(),
});
export const PlanSchema = z.object({ tasks: z.array(PlanTaskSchema).min(1).max(6) });
/** Builds the planning prompt for roadmap execution. */
export function buildPlannerPrompt(cfg, goal, overview) {
    const roles = Object.keys(cfg.agents).filter((role) => role !== 'planner' && role !== 'default');
    const isDirect = cfg.executionMode !== 'worktree';
    return `Bạn là Planner điều phối một đội coding agent triển khai dự án theo Roadmap.

MỤC TIÊU: ${goal}

TỔNG QUAN REPO (${overview.fileCount} files):
${overview.tree}

ROLE CÓ THỂ GIAO VIỆC: ${roles.join(', ')}

QUY TẮC:
1. Phân chia mục tiêu thành 1 đến 6 task theo một lộ trình (Roadmap) mạch lạc.
2. Thiết lập "dependsOn" chính xác: task nào cần kết quả của task trước (ví dụ: tạo backend/schema trước, làm UI hoặc test sau) thì đưa id của task trước vào "dependsOn".${isDirect ? ' Các task sau sẽ kế thừa trực tiếp mã nguồn của các task trước đã làm.' : ''}
3. Các task không phụ thuộc nhau có thể chạy độc lập và không được sửa trùng file.
4. "files" liệt kê các path/thư mục task sẽ tạo hoặc chỉnh sửa.
5. "prompt" là chỉ thị đầy đủ, tự đứng một mình, hướng dẫn rõ ràng file cần tạo hoặc sửa.
6. Mỗi task có thể có "verify" là lệnh shell kiểm chứng (hoặc bỏ trống).

CHỈ TRẢ VỀ JSON THUẦN:
{"tasks":[{"id":"t1","title":"...","role":"...","files":["..."],"dependsOn":[],"prompt":"...","verify":"lệnh shell, hoặc bỏ trống"}]}`;
}
/** Summarizes tracked files without reading repository contents. */
export async function repoOverview(repoPath) {
    const { stdout } = await runGit(repoPath, ['ls-files']);
    const files = stdout.split(/\r?\n/).filter((filePath) => filePath.length > 0);
    const groups = new Map();
    for (const filePath of files) {
        const segments = filePath.split('/');
        const group = segments.length === 1 ? '(root)' : segments.slice(0, 2).join('/');
        groups.set(group, (groups.get(group) ?? 0) + 1);
    }
    const tree = [...groups.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 40)
        .map(([group, count]) => `${group}: ${count}`)
        .join('\n');
    return { fileCount: files.length, tree: tree || '(no tracked files)' };
}
/** Extracts a balanced JSON object from agent output, filtering out reasoning tags and prioritizing objects containing "tasks". */
export function extractJson(text) {
    // 1. Remove reasoning / thinking tags common in reasoning models (DeepSeek-R1, Nemotron, QwQ, etc.)
    const cleaned = text
        .replace(/<think[\s\S]*?<\/think>/gi, '')
        .replace(/<thought[\s\S]*?<\/thought>/gi, '')
        .trim();
    // 2. Check for explicit ```json ... ``` or ``` ... ``` code fences first
    const fenceMatches = [...cleaned.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (const match of fenceMatches) {
        const candidate = match[1].trim();
        if (candidate.startsWith('{') && candidate.endsWith('}')) {
            try {
                const obj = JSON.parse(candidate);
                if (obj && typeof obj === 'object' && Array.isArray(obj.tasks)) {
                    return candidate;
                }
            }
            catch { }
        }
    }
    // 3. Extract all top-level balanced JSON objects
    const target = cleaned.includes('{') ? cleaned : text;
    const candidates = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let start = -1;
    for (let index = 0; index < target.length; index += 1) {
        const character = target[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (character === '\\') {
                escaped = true;
            }
            else if (character === '"') {
                inString = false;
            }
            continue;
        }
        if (character === '"') {
            inString = true;
        }
        else if (character === '{') {
            if (depth === 0) {
                start = index;
            }
            depth += 1;
        }
        else if (character === '}') {
            depth -= 1;
            if (depth === 0 && start !== -1) {
                candidates.push(target.slice(start, index + 1));
                start = -1;
            }
        }
    }
    if (candidates.length === 0) {
        if (start !== -1) {
            throw new PlanError('Planner output contains an unterminated JSON object.');
        }
        throw new PlanError('Planner output does not contain a JSON object.');
    }
    // 4. Prioritize candidate that parses successfully and contains tasks
    for (const cand of candidates) {
        try {
            const obj = JSON.parse(cand);
            if (obj && typeof obj === 'object' && Array.isArray(obj.tasks)) {
                return cand;
            }
        }
        catch { }
    }
    // 5. Fall back to first candidate that is valid JSON
    for (const cand of candidates) {
        try {
            JSON.parse(cand);
            return cand;
        }
        catch { }
    }
    return candidates[0];
}
/** Parses, validates, and completes an agent-generated plan. */
export function parsePlanOutput(output, goal) {
    let parsed;
    try {
        parsed = JSON.parse(extractJson(output));
    }
    catch (error) {
        if (error instanceof PlanError) {
            throw error;
        }
        throw new PlanError('Planner output contains invalid JSON.', { cause: error });
    }
    return validatePlan(parsed, goal);
}
/** Validates a plan document from any source and fills in deterministic branch names. */
export function validatePlan(value, goal) {
    const result = PlanSchema.safeParse(value);
    if (!result.success) {
        const issues = result.error.issues
            .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
            .join('; ');
        throw new PlanError(`Planner output has an invalid plan shape: ${issues}`, { cause: result.error });
    }
    const tasks = result.data.tasks.map((task) => ({
        ...task,
        branch: task.branch ?? `squad/${task.id}-${slug(task.title)}`,
    }));
    detectCycle(tasks);
    return { goal, tasks };
}
/** Rejects duplicate ids, missing dependencies, and all dependency cycles. */
export function detectCycle(tasks) {
    const tasksById = new Map();
    for (const task of tasks) {
        if (tasksById.has(task.id)) {
            throw new PlanError(`Plan contains duplicate task id: ${task.id}.`);
        }
        tasksById.set(task.id, task);
    }
    for (const task of tasks) {
        for (const dependencyId of task.dependsOn) {
            if (!tasksById.has(dependencyId)) {
                throw new PlanError(`Task ${task.id} depends on unknown task ${dependencyId}.`);
            }
        }
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (task) => {
        if (visited.has(task.id)) {
            return;
        }
        if (visiting.has(task.id)) {
            throw new PlanError(`Plan contains a dependency cycle involving task ${task.id}.`);
        }
        visiting.add(task.id);
        for (const dependencyId of task.dependsOn) {
            visit(tasksById.get(dependencyId));
        }
        visiting.delete(task.id);
        visited.add(task.id);
    };
    for (const task of tasks) {
        visit(task);
    }
}
/** Returns tasks in dependency order after validating the graph. */
export function topoSort(tasks) {
    detectCycle(tasks);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const visited = new Set();
    const ordered = [];
    const visit = (task) => {
        if (visited.has(task.id)) {
            return;
        }
        visited.add(task.id);
        for (const dependencyId of task.dependsOn) {
            visit(tasksById.get(dependencyId));
        }
        ordered.push(task);
    };
    for (const task of tasks) {
        visit(task);
    }
    return ordered;
}
/** Finds overlapping declared files between tasks with no dependency relationship. */
export function fileConflicts(tasks) {
    detectCycle(tasks);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const reaches = (from, targetId, seen = new Set()) => {
        if (from.dependsOn.includes(targetId)) {
            return true;
        }
        for (const dependencyId of from.dependsOn) {
            if (seen.has(dependencyId)) {
                continue;
            }
            seen.add(dependencyId);
            if (reaches(tasksById.get(dependencyId), targetId, seen)) {
                return true;
            }
        }
        return false;
    };
    const conflicts = [];
    for (let leftIndex = 0; leftIndex < tasks.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < tasks.length; rightIndex += 1) {
            const left = tasks[leftIndex];
            const right = tasks[rightIndex];
            if (reaches(left, right.id) || reaches(right, left.id)) {
                continue;
            }
            const files = left.files.filter((leftFile) => right.files.some((rightFile) => pathsOverlap(leftFile, rightFile)));
            if (files.length > 0) {
                conflicts.push({ taskA: left.id, taskB: right.id, files: [...new Set(files)] });
            }
        }
    }
    return conflicts;
}
const slug = (value) => {
    const normalized = value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return normalized || 'task';
};
const pathsOverlap = (left, right) => {
    const leftPath = left.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    const rightPath = right.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
    return (leftPath === rightPath ||
        leftPath.startsWith(`${rightPath}/`) ||
        rightPath.startsWith(`${leftPath}/`));
};
//# sourceMappingURL=planner.js.map