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
/** Builds the exact planning prompt specified by the roadmap. */
export function buildPlannerPrompt(cfg, goal, overview) {
    const roles = Object.keys(cfg.agents).filter((role) => role !== 'planner' && role !== 'default');
    return `Bạn là Planner của một đội coding agent chạy SONG SONG trên các git worktree riêng biệt.

MỤC TIÊU: ${goal}

TỔNG QUAN REPO (${overview.fileCount} files):
${overview.tree}

ROLE CÓ THỂ GIAO VIỆC: ${roles.join(', ')}

QUY TẮC:
1. Hai task chạy song song TUYỆT ĐỐI không được sửa cùng 1 file. Không tách được thì đặt task sau vào "dependsOn".
2. QUAN TRỌNG: "dependsOn" chỉ đảm bảo THỨ TỰ CHẠY, task sau KHÔNG thấy được code của task trước (worktree độc lập, merge diễn ra sau cùng). Nếu 1 task cần dùng trực tiếp code/API mà task khác vừa tạo ra, đừng tách 2 task — gộp lại thành 1.
3. Mỗi task phải kiểm chứng độc lập được (test/build tự chạy ra đúng/sai).
4. Tối đa 6 task.
5. "files" liệt kê path/thư mục task sẽ chạm vào — dùng để phát hiện xung đột.
6. "prompt" là chỉ thị đầy đủ, tự đứng một mình (agent không thấy mục tiêu gốc).

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
/** Extracts the first balanced JSON object after removing Markdown code fences. */
export function extractJson(text) {
    const withoutFences = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
    const start = withoutFences.indexOf('{');
    if (start === -1) {
        throw new PlanError('Planner output does not contain a JSON object.');
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < withoutFences.length; index += 1) {
        const character = withoutFences[index];
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
            depth += 1;
        }
        else if (character === '}') {
            depth -= 1;
            if (depth === 0) {
                return withoutFences.slice(start, index + 1);
            }
        }
    }
    throw new PlanError('Planner output contains an unterminated JSON object.');
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