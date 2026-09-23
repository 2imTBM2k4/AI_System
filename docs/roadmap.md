# Roadmap kỹ thuật — Squad (đội coding agent đa model)

Dự án độc lập, không liên quan DroneFood hay các dự án khác. Mục tiêu: CLI điều phối nhiều coding agent chạy song song trên git worktree, sau này thêm web UI dùng chung logic lõi.

---

## 0. Quyết định nền tảng

### 0.1 Package manager: **pnpm workspaces**

So với npm workspaces, áp vào đúng shape dự án này (`core` bị `cli` và `server` cùng import, sau này `web` cũng cần type dùng chung):

| Tiêu chí | npm workspaces | pnpm workspaces | Ảnh hưởng tới dự án này |
|---|---|---|---|
| Cách resolve dependency nội bộ | Không có `workspace:*`, dễ publish nhầm bản tham chiếu local | Có `workspace:*`, tự thay bằng version thật lúc publish | `cli` và `server` đều import `core` — cần chắc chắn luôn dùng bản local khi dev |
| Isolation | Hoist phẳng vào root `node_modules` → package có thể dùng lib mà nó không khai báo, chỉ lộ ra khi cấu trúc thay đổi | Strict theo mặc định, mỗi package chỉ thấy dependency nó khai báo | Bạn đang luyện thói quen kiến trúc sạch cho CV backend — hoisting phẳng của npm sẽ che giấu lỗi khai báo dependency đến tận lúc muộn |
| Filtering | Chạy theo tên workspace, không có graph traversal | `pnpm --filter core... run test`, `pnpm --filter web build` — chạy theo dependency graph | Hữu ích khi repo lớn dần, ví dụ chỉ test `core` mà không cần build `web` |
| Tốc độ / dung lượng | Copy phẳng, cài lại nhiều lần | Content-addressable store, hard-link, nhanh hơn ~2-5 lần install | Không quan trọng lắm ở quy mô 4 package, nhưng free lunch |
| Độ quen thuộc / setup | Có sẵn trong npm, không cần cài thêm | Cần `npm i -g pnpm` một lần | Chi phí học gần như 0, lệnh gần giống npm |

**Kết luận**: dự án có ≥3 package nội bộ phụ thuộc lẫn nhau — đúng use case pnpm được sinh ra để giải quyết. npm workspaces chỉ đủ tốt cho monorepo 2-3 package không có nhiều dependency chéo. Dùng pnpm.

Không cần Turborepo/Nx ở giai đoạn này — dự án còn nhỏ, thêm build cache tool bây giờ là tối ưu sớm. Cân nhắc lại nếu sau này số package tăng lên hoặc CI chạy chậm.

### 0.2 Ngôn ngữ: **TypeScript cho toàn bộ monorepo** (kể cả `core`)

Lý do chọn thay vì giữ JS thuần:

1. **`core` là hợp đồng (contract) giữa `cli` và `server`.** Event `task:start`/`task:log`/`task:done`, shape của `Plan`, `TaskResult` — đây chính xác là loại dữ liệu mà một lỗi gõ sai tên field (`task.dependsOn` vs `task.depends_on`) sẽ không lộ ra cho tới khi chạy, và JS thuần không bắt được lúc build.
2. **`server` và `web` sau này chia sẻ type** (`packages/shared-types`) — request/response của REST API và SSE event. Không có kiểu chung, frontend/backend sẽ lệch nhau âm thầm.
3. Node 22 hỗ trợ `node --experimental-strip-types` chạy `.ts` trực tiếp không cần bundler cho dev — chi phí setup TS năm 2026 thấp hơn nhiều so với vài năm trước.
4. Đây là dự án portfolio để apply backend — TypeScript gần như là kỳ vọng mặc định ở JD backend Node hiện nay.

Đánh đổi: bạn phải viết thêm type, build step trước khi chạy `cli`/`server`. Chấp nhận được vì đổi lại tránh đúng loại lỗi (interface lệch giữa 2 consumer) mà dự án này chắc chắn sẽ gặp.

---

## 1. Cấu trúc thư mục mục tiêu

```
squad/
├─ pnpm-workspace.yaml
├─ package.json                 # root, chỉ chứa devDependencies dùng chung
├─ tsconfig.base.json
├─ packages/
│  ├─ core/
│  │  ├─ src/
│  │  │  ├─ types.ts            # Plan, Task, TaskResult, AgentSpec, SquadEvent...
│  │  │  ├─ config.ts           # load + validate squad.config.json (zod)
│  │  │  ├─ git.ts               # worktree, commit, merge — port từ bản JS hiện tại
│  │  │  ├─ planner.ts
│  │  │  ├─ runner.ts            # SquadOrchestrator extends EventEmitter
│  │  │  ├─ merge.ts
│  │  │  ├─ store.ts             # SQLite: runs, tasks, events
│  │  │  └─ index.ts             # export public API
│  │  ├─ test/
│  │  └─ package.json            # name: "@squad/core"
│  ├─ cli/
│  │  ├─ src/
│  │  │  ├─ commands/            # plan.ts, run.ts, merge.ts, status.ts, clean.ts
│  │  │  └─ index.ts
│  │  └─ package.json            # name: "@squad/cli", bin: squad
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ routes/              # repos, runs, events (SSE)
│  │  │  ├─ app.ts
│  │  │  └─ index.ts
│  │  └─ package.json            # name: "@squad/server"
│  └─ shared-types/
│     ├─ src/index.ts            # type dùng chung API server <-> web
│     └─ package.json
├─ apps/
│  └─ web/                       # Phase 3, React + Vite + TS
└─ docs/
   ├─ roadmap.md                 # chính là file này
   ├─ architecture.md            # sẽ viết cuối Phase 1
   └─ adr/                       # Architecture Decision Records, 1 file/quyết định lớn
```

---

## 2. Phase 1 — `core` + `cli` (mục tiêu: 2-3 ngày)

### 2.1 Việc cần làm, theo thứ tự

1. **Khởi tạo monorepo**: `pnpm-workspace.yaml`, `tsconfig.base.json` (target ES2022, module NodeNext, strict: true), root `package.json` với script `pnpm -r build`, `pnpm -r test`.
2. **`packages/core/src/types.ts`** — định nghĩa trước, code sau. Tối thiểu cần:

   > `AgentSpec`/`SquadConfig` **không** định nghĩa ở đây — theo Phụ lục A, hai type này là `z.infer` từ schema trong `config.ts`, import ngược lại nếu `types.ts` cần dùng. Tránh viết tay 2 nơi rồi lệch nhau.

   ```ts
   type TaskStatus = 'pending' | 'running' | 'passed' | 'verify_failed'
     | 'agent_failed' | 'bootstrap_failed' | 'skipped' | 'cancelled' | 'interrupted' | 'error';

   interface Task { id: string; title: string; role: string; files: string[];
     dependsOn: string[]; prompt: string; verify?: string; branch: string; }

   interface Plan { goal: string; tasks: Task[]; }

   type RunStatus = 'planned' | 'running' | 'completed' | 'interrupted' | 'failed';
   // 'cancelled' KHÔNG thuộc RunStatus — đó là giá trị của TaskStatus, dễ nhầm (đã nhầm thật ở
   // useSquadEvents.ts lúc code Phase 3). 'completed' gán khi run hoàn tất vòng đời dù có task
   // con fail/cancel bên trong hay không — completed nghĩa là "chạy xong", không phải "mọi task đều passed".

   interface TaskResult extends Task { status: TaskStatus; agent?: string;
     changedFiles?: string[]; log: string; startedAt: string; endedAt?: string; error?: string; }

   type SquadEvent =
     | { type: 'plan:start'; goal: string }
     | { type: 'plan:log'; chunk: string }
     | { type: 'plan:done'; runId: string; plan: Plan; warnings: FileConflict[] }
     | { type: 'run:start'; runId: string; plan: Plan }
     | { type: 'task:start'; runId: string; taskId: string }
     | { type: 'task:log'; runId: string; taskId: string; chunk: string }
     | { type: 'task:done'; runId: string; result: TaskResult }
     | { type: 'run:done'; runId: string; results: TaskResult[] };
   ```

   > `plan:*` được emit bởi `makePlan()` (agent planner) và `createRunFromPlan()` (chỉ `plan:done`, xem Phụ lục D) — port cùng lúc với bước 7, không phải bổ sung sau. `merge:*` **chưa quyết định** — không chặn Phase 1, nhưng Phase 3 (web) sẽ cần quay lại bổ sung.
3. **Port `git.js` → `git.ts`**: gần như copy nguyên, chỉ thêm type cho tham số/return. Đây là phần rủi ro thấp nhất, làm trước để có "thắng lợi nhanh".
4. **Port `config.js` → `config.ts`**, dùng `zod` (hoặc tương đương) để validate `squad.config.json` thay vì check tay từng field — lỗi config sẽ báo rõ field nào sai thay vì crash mơ hồ.

   **Quy ước persona theo role** — mỗi role tách 2 phần:
   - *Routing* (`cli`, `model`, `command`) → vẫn khai báo trong `squad.config.json` như hiện tại.
   - *Persona/instruction* (role này phải làm gì, quy tắc riêng) → file Markdown riêng, **không** dùng format subagent `.md` của Claude Code (`.claude/agents/*.md`) vì chỉ Claude Code đọc được, không portable sang Codex/Gemini.

   `resolveAgent(cfg, role)` tự tìm `roles/<role>.md` theo quy ước tên (ví dụ role `tester` → `roles/tester.md`); có thì đọc và ghép vào **trước** `task.prompt` lúc render, không có thì bỏ qua. Cho phép override đường dẫn bằng field `promptFile` trong `agents.<role>` khi cần đặt tên khác hoặc dùng chung 1 file cho nhiều role:
   ```json
   "agents": {
     "tester": { "cli": "gemini", "model": "gemini-2.5-pro", "promptFile": "roles/tester.md" }
   }
   ```
   Thêm `promptFile?: string` vào `AgentSpec` — đã có sẵn trong `AgentSpecSchema` ở Phụ lục A, không cần sửa gì thêm ở bước này.
5. **`store.ts`** — SQLite qua `node:sqlite` (built-in từ Node 22, không cần cài thêm). Schema tối thiểu:
   ```sql
   CREATE TABLE runs (id TEXT PRIMARY KEY, repo_path TEXT, goal TEXT,
     plan_json TEXT, pid INTEGER, status TEXT, created_at TEXT, ended_at TEXT);
   CREATE TABLE tasks (id TEXT, run_id TEXT, title TEXT, role TEXT,
     status TEXT, branch TEXT, log_path TEXT, started_at TEXT, ended_at TEXT,
     error TEXT, pid INTEGER, PRIMARY KEY (id, run_id));
   CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT,
     task_id TEXT, type TEXT, payload TEXT, created_at TEXT);
   ```
   `plan_json` lưu toàn bộ `Plan` (gồm `dependsOn` từng task) — cần cho `mergeAll(runId)` ở bước 7 tính thứ tự merge mà không cần caller giữ state. `events` lưu cả `task:log` dạng append — đây là thứ SSE sau này sẽ replay khi web client refresh giữa chừng một run.
6. **`runner.ts` — điểm khó nhất của phase này.** Đổi `onStart/onDone` callback thành class kế thừa `EventEmitter`:
   ```ts
   class SquadOrchestrator extends EventEmitter {
     async makePlan(repoPath: string, goal: string): Promise<{ runId: string; plan: Plan }>
     async runPlan(repoPath: string, plan: Plan, runId: string): Promise<TaskResult[]>
     cancelTask(taskId: string): void   // giữ ChildProcess, gọi .kill()
   }
   ```
   > `runId` do `makePlan()` sinh và ghi vào `runs.plan_json` ngay từ lúc lập plan (status `'planned'`), truyền lại cho `runPlan()` — không tự sinh mới trong `runPlan()`. Xem lý do ở Phụ lục C.
   Mỗi chỗ hiện đang `log.write(...)` trong bản JS cũ → vừa ghi file vừa `this.emit('task:log', {...})`. Mỗi task chạy xong → ghi vào SQLite qua `store.ts` NGOÀI việc emit event, để web load lại lịch sử không cần server đang chạy live.

   **4 quy tắc hành vi bắt buộc** (đã chốt, xem lý do đầy đủ ở Phụ lục B):
   - `runPlan()` **không** tự merge khi task `passed` — chỉ tạo commit trên branch riêng, merge luôn là hành động tách biệt do người gọi kích hoạt (giữ chỗ trống cho approval gate ở web Phase 3).
   - `task.verify` **override hoàn toàn** `cfg.verify` khi có mặt, không chạy nối tiếp cả hai (bộ verify đầy đủ đã chạy lại ở tầng merge).
   - Lỗi `bootstrap`/`copyFiles` chỉ đánh dấu `bootstrap_failed` cho đúng task đó; task độc lập khác trong cùng batch không bị ảnh hưởng, task phụ thuộc nhận `skipped`.
   - `cancelTask()` ghi status `'cancelled'` (không dùng `'error'`), không chạy verify, vẫn cố `commitAll` giữ WIP.
7. **`planner.ts`, `merge.ts`**: đổi throw thường thành custom Error class có `code` (`PLAN_INVALID`...) cho lỗi *toàn cục, không thể tiếp tục* — conflict/verify fail khi merge **không** thuộc nhóm này, xem Phụ lục C.
8. **`packages/cli`**: mỏng nhất có thể — chỉ subscribe event của `core` rồi in ra terminal + gọi `process.exit`. Không có business logic nào nằm trong `cli` sau bước này.
9. **Viết test cho `core` bằng fake agent** (đã có sẵn cách làm — mock bash script bạn thấy ở bản demo trước). Tối thiểu test lại đúng những case đã pass thủ công trước đó: chạy song song đúng thứ tự dependency, conflict file bị chặn, verify fail thì không merge, task phụ thuộc task fail thì bị skip, cycle/id trùng/dep không tồn tại bị từ chối.

   Bổ sung (phát sinh từ Phụ lục C/D, chưa có trong danh sách gốc ở trên): thứ tự event `plan:start`/`plan:log`/`plan:done` + SQLite ghi trước emit sau, `createRunFromPlan()` tự chối Plan có cycle, `listRuns`/`listAllTasks`, `clean` với git thật (worktree/branch xoá độc lập nhau, branch chưa merge bị giữ lại không chặn phần còn lại). **Và test riêng cho `packages/cli`** — bản thân `core` pass hết không đồng nghĩa CLI ghép đúng: exit code theo đúng bảng Phụ lục D, `squad run` không gọi lại `makePlan()` khi đã có `planFile`, conflict gate chặn đúng khi thiếu `--force`.

### 2.2 Definition of Done — Phase 1

- Chạy được đầy đủ lifecycle `init` → `plan` → `run` → `merge` → `status` → `clean` trên 1 repo Git thật có `squad.config.json` hợp lệ, **với ít nhất 1 lần dùng agent CLI thật** (không chỉ fake agent trong test) để xác nhận `CLI_PRESETS` (Phụ lục A) còn đúng với bản CLI đang cài — fake agent không kiểm chứng được điều này. *(Thay cho tiêu chí gốc "giống hệt bản JS hiện tại" — đã lỗi thời từ khi kiến trúc runId/SQLite/multi-command thay thế hoàn toàn bản JS demo ban đầu.)*
- `pnpm --filter core test` chạy độc lập, không cần CLI thật, không cần agent thật.
- Không còn `console.log`/`process.exit` nào trong `packages/core`.
- `docs/architecture.md` mô tả event schema + DB schema ở trên (copy từ roadmap này, chỉnh nếu code thực tế lệch đi khi làm).

---

## Phụ lục A — `squad.config.json` (schema đã chốt)

Chốt trước khi code bước 4, để tránh sửa lại `types.ts`/`resolveAgent()` giữa chừng.

**Khác với bản JS gốc**: `stateFile` (JSON, ghi đè mỗi run) → `dbFile` (SQLite, giữ lịch sử nhiều run, khớp bước 5 Phase 1). Thêm `agents.<role>.promptFile` (quy ước `roles/<role>.md`, xem mục 2.1 bước 4) và `configVersion` (dự phòng migration khi Phase 2/3 thêm field).

**Quyết định thiết kế**: `agents.<role>.cli` là `z.string()` tự do, không enum cứng — danh sách preset hợp lệ nằm trong `CLI_PRESETS` (code), không trong schema, để thêm CLI mới chỉ sửa 1 chỗ. `agents` bắt buộc có key `default` (fallback của `resolveAgent()`), validate ngay lúc load config để lỗi hiện sớm thay vì crash giữa lúc chạy plan.

```ts
// packages/core/src/config.ts
import { z } from 'zod';

const AgentSpecSchema = z
  .object({
    cli: z.string().optional(),          // khớp CLI_PRESETS, hoặc bỏ trống nếu có "command"
    model: z.string().optional(),
    command: z.array(z.string()).min(1).optional(),  // argv template, override preset
    env: z.record(z.string()).optional(),
    promptFile: z.string().optional(),   // mặc định resolveAgent tự tìm roles/<role>.md
  })
  .refine((s) => s.cli !== undefined || s.command !== undefined, {
    message: 'Agent phải khai báo "cli" hoặc "command".',
  });

export const SquadConfigSchema = z
  .object({
    configVersion: z.literal(1).default(1),
    baseBranch: z.string().default('main'),
    integrationBranch: z.string().default('squad/integration'),
    worktreeDir: z.string().default('.squad/worktrees'),
    dbFile: z.string().default('.squad/squad.db'),
    planFile: z.string().default('.squad/plan.json'),
    logDir: z.string().default('.squad/logs'),
    maxParallel: z.number().int().min(1).max(10).default(3),
    timeoutMinutes: z.number().int().min(1).default(30),
    bootstrap: z.array(z.string()).default([]),
    copyFiles: z.array(z.string()).default([]),
    verify: z.array(z.string()).default([]),
    agents: z.record(AgentSpecSchema),
  })
  .refine((cfg) => 'default' in cfg.agents, {
    message: 'agents phải có role "default" làm fallback.',
    path: ['agents'],
  });

export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type SquadConfig = z.infer<typeof SquadConfigSchema>;
```

Dùng `z.infer` làm nguồn type duy nhất — không viết tay `AgentSpec`/`SquadConfig` riêng trong `types.ts` để tránh 2 chỗ lệch nhau.

**`CLI_PRESETS` (mặc định cho `agents.<role>.cli`)** — verify bằng `--help` của đúng bản CLI đã cài trước khi chạy thật lần đầu, vì flag của cả 3 CLI này đổi khá nhanh (ví dụ Codex gần đây bỏ `--full-auto` ở một số bản). Sai thì sửa qua field `command` trong `squad.config.json`, không sửa code `core`:

```ts
export const CLI_PRESETS: Record<string, string[]> = {
  claude: ['claude', '-p', '{{prompt}}', '--permission-mode', 'acceptEdits', '--model', '{{model}}'],
  codex:  ['codex', 'exec', '--sandbox', 'workspace-write', '--model', '{{model}}', '{{prompt}}'],
  gemini: ['gemini', '--yolo', '--model', '{{model}}', '-p', '{{prompt}}'],
};
```

Cả 3 preset đều bắt buộc có flag non-interactive (`-p`/`exec`) + flag bỏ qua permission prompt (`--permission-mode acceptEdits` / `--sandbox workspace-write` / `--yolo`) — thiếu 1 trong 2 thì process spawn không TTY sẽ treo tới khi hết `timeoutMinutes` rồi bị kill, vì không có ai trả lời prompt tương tác.

**Resolve `roles/<role>.md` và mọi path khác trong config** (`worktreeDir`, `dbFile`, `planFile`, `logDir`, `copyFiles`, `promptFile`) đều tương đối với **thư mục chứa `squad.config.json`** — ở Phase 1 đây luôn là `repoRoot` (`squad init` ghi config vào root repo target), nên không có ngoại lệ giữa các field. `roles/*.md` commit vào git của repo target (khác `.squad/` bị gitignore) vì là nội dung persona đặc thù dự án, không phải state runtime.

Ví dụ file hợp lệ:

```json
{
  "configVersion": 1,
  "baseBranch": "main",
  "maxParallel": 2,
  "timeoutMinutes": 30,
  "bootstrap": ["pnpm install"],
  "copyFiles": [".env"],
  "verify": ["pnpm test"],
  "agents": {
    "planner": { "cli": "claude", "model": "opus" },
    "backend": { "cli": "claude", "model": "sonnet" },
    "frontend": { "cli": "codex", "model": "gpt-5-codex" },
    "tester": { "cli": "gemini", "model": "gemini-2.5-pro", "promptFile": "roles/tester.md" },
    "default": { "cli": "claude", "model": "sonnet" }
  }
}
```

---

## Phụ lục B — `runner.ts`: quy tắc hành vi & cơ chế đồng bộ (EventEmitter + SQLite)

Chốt trước khi code bước 6 — đây là phần rủi ro cao nhất Phase 1.

### Quy tắc hành vi

1. **Không auto-merge.** `runPlan()` chỉ tạo commit trên branch riêng của từng task; merge (`mergeAll()`) luôn là hành động tách biệt do CLI (`squad merge`/`--merge`) hoặc server sau này (nút "Approve & Merge") kích hoạt tường minh. `core` không tự quyết merge — bắt buộc để giữ chỗ cho approval gate ở web Phase 3.
2. **`task.verify` override hoàn toàn `cfg.verify`**, không chạy nối tiếp cả hai:
   ```ts
   const verifyCmd = task.verify || cfg.verify.join(' && ');
   ```
   Lý do: đã có 2 tầng kiểm chứng tách biệt — tầng task (song song, hẹp, do planner sinh) và tầng merge (`mergeAll()` tự chạy `cfg.verify` đầy đủ sau mỗi lần merge). Chạy cả hai ở tầng task là trùng công vô ích vì tầng merge đã đảm nhiệm việc đó.
3. **Cô lập lỗi theo task.** Lỗi `bootstrap`/`copyFiles` chỉ gắn `bootstrap_failed` cho đúng task đó; task độc lập khác trong cùng batch tiếp tục bình thường; task có `dependsOn` trỏ tới task lỗi nhận `skipped`.
4. **`cancelTask(taskId)`**: kill child process, ghi status `'cancelled'` (không dùng `'error'` — dành riêng cho lỗi hệ thống ngoài ý muốn), **không chạy verify**, vẫn cố `commitAll` để giữ phần code dở dang (`squad(id): WIP (cancelled by user)`).

### Cơ chế tránh race condition

**a) Ghi SQLite xong rồi mới emit event, không bao giờ ngược lại.** Emit trước sẽ khiến listener (ví dụ server forward SSE) query lại DB ngay lập tức và đọc phải state cũ. Thứ tự bắt buộc trong mọi handler: `store.save(...)` → `this.emit(...)`.

**b) Mỗi lần ghi liên quan tới 1 task là 1 khối đồng bộ, không `await` xen giữa các câu SQL liên quan.** `node:sqlite` (`DatabaseSync`) là API đồng bộ — lợi dụng việc Node single-thread: gọi đồng bộ tự loại trừ lẫn nhau, 2 task "xong cùng lúc" không thể ghi đè giữa chừng của nhau miễn là hàm ghi trong `store.ts` không có `await` chen giữa. Nhiều câu lệnh liên quan thì bọc `BEGIN`...`COMMIT`, hoặc giữ hàm hoàn toàn đồng bộ.

**c) `cancelTask()` dùng cờ để tránh race với task tự hoàn thành đúng lúc bị cancel.** Giữ `Map<taskId, { child: ChildProcess; cancelled: boolean }>`. Cancel: set `cancelled = true` **trước khi** `child.kill()`. Trong handler `close`, luôn check cờ này trước khi quyết định status cuối — `cancelled === true` thì ghi `'cancelled'` bất kể exit code (process bị kill trả exit code không đáng tin). Guard thêm cờ `finalized` để không double-write/double-emit nếu 2 đường xử lý cùng cố finalize 1 task.

**d) Không dùng tên event `'error'` (chuỗi thuần) cho `SquadEvent`.** Node `EventEmitter` coi `'error'` là tên đặc biệt — `emit('error', ...)` không có listener sẽ throw và có thể crash cả process. Lỗi của 1 task nằm trong field `status: 'error'` của `task:done`, không phải 1 event type riêng.

### Reconciliation task mắc kẹt `'running'` sau khi process bị ngắt giữa chừng

Không riêng `server` — CLI cũng gặp: `squad run` bị Ctrl+C/terminal đóng/máy sleep giữa chừng để lại task `'running'` vĩnh viễn, khiến `clean` từ chối dọn mãi mãi (chặn đúng task `'running'`/`'pending'` theo thiết kế). Cơ chế sửa nằm ở `core`, dùng chung cả CLI lẫn server, không phải logic riêng của tầng nào.

- Thêm cột `runs.pid INTEGER` (PID process điều phối — CLI tự ghi `process.pid` của chính nó, `server` ghi `process.pid` của chính server) và `tasks.pid INTEGER` (PID agent child, giữ nguyên nghĩa — không dùng cho quyết định reconcile, chỉ để quan sát/debug). `startPlannedRun()` ghi `runs.pid` ngay lúc chuyển `'planned'`→`'running'` (cùng transaction). `runner.ts` ghi `tasks.pid` ngay sau `spawn()` agent, trước khi chuyển task sang `'running'`.
- Export `reconcileOrphanedTasks(repoPath)`, vào bằng **run** (không phải từng task) — chỉ dựa vào `runs.pid` để quyết định, đúng ở mọi pha của `runPlan()` (setup/bootstrap/spawn/running/merge), không chỉ lúc có task đang chạy:

  ```
  Với mỗi run có runs.status = 'running':
    if not processAlive(runs.pid):   // process.kill(pid, 0), không gửi signal
      UPDATE tasks SET status = 'interrupted' WHERE run_id = X AND status IN ('running', 'pending')
      UPDATE runs SET status = 'interrupted', ended_at = now WHERE id = X
  ```
- `'interrupted'` (status riêng — khác `'error'`, vì đây là "không biết kết quả thật", không phải "biết chắc có lỗi", cùng lý do tách `'cancelled'` trước đó) — gọi hàm này ở đầu mỗi lệnh CLI (chi phí gần 0 khi không có run nào cần xử lý) và lúc `server` khởi động (quét toàn bộ repo trong registry, xem Phụ lục E).
- `'interrupted'` không cần sửa gì thêm ở `merge.ts`/`clean` — tự động không lọt điều kiện merge (`status === 'passed'`), tự động không còn bị `clean` chặn (chỉ chặn `'running'`/`'pending'`).
- **Giới hạn chấp nhận được**: PID có thể bị OS tái sử dụng sau thời gian dài, gây bỏ sót reconcile (không gây xoá/kill nhầm gì — không gửi signal thật). Muốn chắc tuyệt đối cần heartbeat riêng — quá mức cho scope hiện tại.

### Phân định tường minh: `RunStatus` vs `TaskStatus`

Đây là bài học kiến trúc quan trọng phát hiện khi tích hợp Web (Phase 3). Tuyệt đối không được lẫn lộn giữa trạng thái của **Task** và trạng thái của **Run** trong SQLite:

1. **`TaskStatus` (10 trạng thái cấp Task)**:
   ```ts
   export type TaskStatus =
     | 'pending'
     | 'running'
     | 'passed'
     | 'verify_failed'
     | 'agent_failed'
     | 'bootstrap_failed'
     | 'skipped'
     | 'cancelled'
     | 'interrupted'
     | 'error';
   ```
   * `'cancelled'`: Do người dùng bấm "Hủy Task" (`cancelTask()`). Chỉ gán cho riêng task đó, không gán cho Run.
   * `'interrupted'`: Do server/CLI chết bất ngờ, được reconcile quét lại.

2. **`RunStatus` (5 trạng thái cấp Run trong bảng SQLite `runs.status`)**:
   ```ts
   export type RunStatus =
     | 'planned'
     | 'running'
     | 'completed'
     | 'interrupted'
     | 'failed';
   ```
   * `'planned'`: Run mới được tạo kế hoạch (`makePlan` / `POST /repos/:id/plan`), chưa bắt đầu thực thi.
   * `'running'`: Run đang chạy ngầm trong background (`startPlannedRun`).
   * `'completed'`: Run đã hoàn tất vòng đời điều phối toàn bộ plan (`completeRun`) — **kể cả khi có task con bị `cancelled`, `verify_failed` hay `agent_failed`**, trạng thái tổng thể của Run vẫn là `'completed'` (đã chạy xong toàn bộ task có thể chạy).
   * `'interrupted'`: Run bị mồ côi do tiến trình coordinator bị tắt đột ngột, được phục hồi bởi `reconcileOrphanedTasks`.
   * `'failed'`: Lỗi khởi tạo nghiêm trọng cấp run (ví dụ bootstrap toàn cục thất bại).

3. **Quy tắc kiểm tra Run đã kết thúc (`isRunEnded`)**:
   ```ts
   export function isRunEnded(run: { status: RunStatus | string; endedAt: string | null }): boolean {
     return run.endedAt !== null || ['completed', 'interrupted', 'failed'].includes(run.status);
   }
   ```
   Khi `isRunEnded(run) === true`, client (Web) không cần mở stream SSE delta, tránh lãng phí tài nguyên connection.


---

## Phụ lục C — `planner.ts` + `merge.ts`: spec & giới hạn `dependsOn`

Chốt trước khi code bước 7.

### Giới hạn cần biết trước

Worktree của mọi task đều cắt từ `baseBranch` (`addWorktree(..., cfg.baseBranch)` ở `git.ts`), **không** từ branch của task đứng trước trong `dependsOn` — vì merge chỉ diễn ra ở bước `mergeAll()`, sau khi mọi worktree đã đóng. `dependsOn` do đó chỉ đảm bảo **thứ tự chạy** (chờ xong mới bắt đầu), không đảm bảo task sau thấy code của task trước. Dùng `dependsOn` để tránh 2 task cùng sửa 1 file cùng lúc; task thật sự cần dùng code của task khác nên gộp thành 1 task — điều này phải nằm trong prompt của planner (xem dưới) để agent sinh plan không hiểu nhầm.

### `planner.ts`

`makePlan()` là method trên `SquadOrchestrator` (cùng `EventEmitter` với `runPlan`/`mergeAll`), không tách class riêng.

```ts
async makePlan(repoPath: string, goal: string): Promise<{ runId: string; plan: Plan; warnings: FileConflict[] }>

// export riêng, standalone — cli/server gọi lại bất kỳ lúc nào (đặc biệt ngay trước runPlan(),
// vì Plan có thể đã bị sửa tay qua .squad/plan.json sau khi makePlan() trả warnings lần đầu)
function fileConflicts(tasks: Task[]): FileConflict[]
interface FileConflict { taskA: string; taskB: string; files: string[] }
```

`warnings` chỉ để hiển thị tham khảo ngay lúc sinh plan — **không** phải cơ chế chặn. `runPlan()` trong `core` không tự gọi `fileConflicts()` để chặn chạy; quyết định "có cho chạy khi còn conflict hay không" (kiểu `--force`) là việc của tầng `cli`/`server`, không phải `core` — cùng nguyên tắc core là cơ chế, không phải chính sách, đã áp dụng cho việc không tự động merge (Phụ lục B, mục 1).

- Gọi agent qua `resolveAgent(cfg, 'planner')` — dùng lại nguyên `resolveAgent`/`renderAgentPrompt`/`renderAgentCommand` của `config.ts`, không viết lại logic spawn riêng.
- Prompt — nguyên văn, không diễn giải lại khi code:

  ```ts
  function buildPlannerPrompt(cfg: SquadConfig, goal: string, overview: RepoOverview): string {
    const roles = Object.keys(cfg.agents).filter((r) => r !== 'planner' && r !== 'default');
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
  ```

  `overview: RepoOverview` (`{ fileCount: number; tree: string }`) — port nguyên hàm `repoOverview()` từ bản JS: liệt kê file qua `git ls-files`, gom nhóm theo 2 cấp thư mục đầu, lấy top 40 theo số file, không đọc nội dung file nào.

- Parse: `extractJson()` (strip markdown fence, lấy `{...}` đầu tiên trong text) → validate bằng Zod:

  ```ts
  const PlanTaskSchema = z.object({
    id: z.string(),
    title: z.string(),
    role: z.string(),
    files: z.array(z.string()).default([]),
    dependsOn: z.array(z.string()).default([]),
    prompt: z.string(),
    verify: z.string().optional(),
  });
  export const PlanSchema = z.object({ tasks: z.array(PlanTaskSchema).min(1).max(6) });
  ```

  `PlanSchema` và `detectCycle()` export standalone (cùng lý do `fileConflicts()` đã export riêng) — `cli` cần gọi lại cả 2 khi đọc `planFile` bị sửa tay từ đĩa, không chỉ lúc `makePlan()` mới sinh. Xem Phụ lục D.

  Sau Zod: `detectCycle()` (DFS phát hiện vòng lặp `dependsOn`, không biểu diễn được bằng schema) → gán `branch` mặc định cho task chưa có (`squad/<id>-<slug(title)>`) → `fileConflicts(plan.tasks)` tính `warnings` (không chặn, chỉ đính kèm return).
- Ngay khi có `Plan` hợp lệ: sinh `runId` (`crypto.randomUUID()`), ghi `runs` row (`status: 'planned'`, `plan_json: JSON.stringify(plan)`), rồi mới return `{ runId, plan, warnings }`.

### `merge.ts`

```ts
async mergeAll(runId: string): Promise<MergeReport>
```

```ts
interface MergeReport {
  runId: string;
  integrationBranch: string;
  merged: { id: string; branch: string }[];
  conflicts: { id: string; branch: string; files: string[] }[];
  verifyFailed: { id: string; branch: string; exitCode: number }[];
  notMerged: { id: string; branch: string; reason: TaskStatus }[];
}
```

`notMerged` (không đặt tên `skipped` — trùng nghĩa với giá trị `TaskStatus.skipped`, gây nhầm 2 tầng) chứa mọi task không phải status `'passed'`, `reason` giữ nguyên status thật của task đó để biết chính xác lý do.

**Điều kiện merge duy nhất: `status === 'passed'`.** Không có status `'done_unverified'` riêng — task không cấu hình `task.verify` lẫn `cfg.verify` thì `runner.ts` gán thẳng `'passed'` (không set gì để verify thì coi bước verify tự qua). Xác nhận lại `runner.ts` đã code đúng quy tắc này trước khi làm `mergeAll()`.

Nhận `runId`, tự load `plan_json` + toàn bộ `tasks` của run đó từ SQLite — không nhận `Plan`/`TaskResult[]` trực tiếp từ caller, vì `mergeAll()` có thể được gọi ở process/thời điểm khác hẳn lúc `runPlan()` chạy (CLI gọi sau, hoặc sau này server nhận request merge từ web).

- **`integrationBranch`**: tạo/reset lazy ngay đầu hàm — chưa có thì tạo từ `baseBranch`; đã có thì `checkout` + `merge --no-edit baseBranch` để đồng bộ trước khi merge tiếp.
- **Thứ tự merge**: topological order tính từ `dependsOn` trong `plan_json` (dùng lại DFS của `detectCycle()`, xuất thêm `topoSort()` để dùng chung) — không theo thứ tự hoàn thành trong batch chạy song song.
- **Conflict**: `git merge --abort`, ghi vào `report.conflicts`, **tiếp tục** branch khác — không dừng toàn bộ. Cùng triết lý cô lập lỗi đã chốt ở Phụ lục B cho `runner.ts`. Không throw `MERGE_CONFLICT`.
- **Verify fail sau merge**: `git reset --hard HEAD~1` (an toàn vì luôn dùng `--no-ff`, chắc chắn đúng 1 merge commit vừa tạo), ghi `report.verifyFailed`, tiếp tục branch khác. `integrationBranch` luôn giữ trạng thái "xanh".
- Custom Error class + `code` chỉ dùng cho lỗi *toàn cục, không thể tiếp tục* (`PLAN_INVALID` khi planner output không parse/validate được) — conflict và verify-fail không thuộc nhóm này, luôn là entry trong `MergeReport` trả về, không throw.

---

## Phụ lục D — `cli`: cú pháp lệnh, exit code, phạm vi `clean`

Chốt trước khi code bước 8.

### Lệnh & lifecycle

```
squad init                                    # không đổi so với bản JS
squad plan "<goal>"                           # makePlan(): agent planner sinh Plan, ghi cfg.planFile + SQLite (status 'planned')
squad run [runId] [--force]                   # không runId: đọc cfg.planFile; có runId: load từ SQLite, bỏ qua planFile
squad do "<goal>" [--force]                   # plan + run liền mạch, vẫn ghi planFile để audit
squad status [runId] [--json]
squad merge <runId>                           # BẮT BUỘC runId, không đoán "run gần nhất"
squad clean [runId] [--delete-branches] [--logs]
```

**`squad run` không có `runId` — đọc `planFile` (có thể đã bị sửa tay), pipeline bắt buộc:**
```
1. Đọc cfg.planFile từ đĩa, JSON.parse
2. Validate lại bằng PlanSchema (Zod) + detectCycle() — export standalone từ planner.ts
3. orchestrator.createRunFromPlan(repoPath, plan) → runId mới (KHÔNG gọi lại makePlan(),
   vì makePlan() gọi agent planner — sẽ ra Plan khác bản đã sửa tay)
4. fileConflicts(plan) — gate, --force để bỏ qua
5. runPlan(repoPath, plan, runId)
```
`createRunFromPlan()` là method trên `SquadOrchestrator` bọc `store.createPlannedRun()` (đã có sẵn từ bước 7) — emit lại đúng event `plan:done`, không thêm event type riêng. Row `'planned'` gốc (trước khi sửa tay) không cần liên kết/dọn gì — giữ làm lịch sử mồ côi, chấp nhận được ở Phase 1.

**`createRunFromPlan()` tự chạy `detectCycle()` trước khi persist, throw `PlanError('PLAN_INVALID')` nếu có vòng lặp — không tin caller đã validate.** Đây là public API của `core`, `server` (Phase 2) sẽ gọi thẳng với `Plan` tự dựng, không chắc đi qua đúng pipeline validate của CLI. `PlanSchema` (Zod, JSON→type) vẫn là việc riêng của CLI vì `createRunFromPlan()` nhận `Plan` đã có type, không parse JSON.

`squad run <runId>` (có tham số) load thẳng `plan_json` từ SQLite, bỏ qua `planFile` — vẫn chạy lại `fileConflicts()` ở bước 4 cho đồng nhất pipeline dù kỹ thuật là dư thừa (Plan trong DB không đổi giữa 2 lần check).

### Config/database

Không có `--config` — `repoRoot()` (`git.ts`) tự tìm root repo qua `git rev-parse --show-toplevel`, đủ cho Phase 1 dù đứng ở thư mục con nào. `dbFile` dùng nguyên field đã resolve trong `SquadConfig`.

`squad status` không `runId`: bảng **10 run gần nhất** (hằng số cứng, không cần `--limit` ở Phase 1). Có `runId`: chi tiết từng task của run đó.

### `clean` — chỉ đụng filesystem, không bao giờ đụng SQLite

- Không `runId`: dọn mọi worktree có task ở trạng thái **kết thúc** (khác `'running'`/`'pending'`) trên toàn bộ run. Có `runId`: chỉ dọn worktree của run đó.
- **An toàn bắt buộc**: trước khi xoá 1 worktree, query status task tương ứng trong DB — task đang `'running'`/`'pending'` thì từ chối xoá (tránh phá worktree đang có agent chạy dở nếu `clean` chạy song song với `run` ở terminal khác).
- Branch chỉ xoá khi có `--delete-branches`, dùng `git branch -d` (safe delete, không phải `-D` force) — branch chưa merge vào đâu (task `agent_failed`/`verify_failed`/`cancelled` chẳng hạn) sẽ bị từ chối xoá, **giữ nguyên** thay vì mất code chưa merge. Xoá worktree và xoá branch là 2 việc độc lập: `-d` bị từ chối không chặn việc xoá worktree, không chặn xử lý task tiếp theo — cùng nguyên tắc "1 lỗi không chặn phần còn lại" đã áp dụng ở `runner.ts`/`merge.ts`. Log lại đúng branch nào bị giữ lại.
- Log file chỉ xoá khi có `--logs` — mặc định giữ lại.
- **SQLite không bao giờ bị đụng tới**, dù flag gì — lý do chuyển sang SQLite từ đầu (Phụ lục A) là giữ lịch sử qua nhiều run, `clean` xoá DB là phá chính mục đích đó.

### `squad init`

```
squad init [--force]
```

```ts
const TEMPLATE: SquadConfig = {
  configVersion: 1,
  baseBranch: 'main',
  integrationBranch: 'squad/integration',
  worktreeDir: '.squad/worktrees',
  dbFile: '.squad/squad.db',
  planFile: '.squad/plan.json',
  logDir: '.squad/logs',
  maxParallel: 3,
  timeoutMinutes: 30,
  bootstrap: [],
  copyFiles: [],
  verify: [],
  agents: {
    default: { cli: 'claude' },
  },
};
```

Ghi đủ mọi field ở giá trị default của Zod (không dựa Zod tự điền ngầm) để người mở file thấy hết tuỳ chọn. `agents` chỉ có `default` — không bịa sẵn nhiều role, đó là việc của từng dự án cụ thể. Không set `model` (dùng model mặc định của CLI, tránh khoá cứng tên hay đổi). `bootstrap`/`verify` để `[]` — không đoán sẵn lệnh cho 1 stack cụ thể.

Sau khi ghi file: in 1 dòng gợi ý bổ sung `bootstrap`/`verify` cho đúng project + trỏ tới roadmap chỗ thêm role khác. Không nhét comment vào JSON.

**Không tạo `.squad/` hay bất kỳ thư mục con nào** (`worktreeDir`, `logDir`, `dbFile`) — đều đã tự tạo lazy đúng lúc cần bởi `git.ts`/`store.ts`/`runner.ts`. **Không tạo `roles/`** — tính năng tuỳ chọn, `resolveAgent()` đã thiết kế im lặng bỏ qua nếu thiếu file.

Chỉ đảm bảo **`.gitignore` có dòng `.squad/`** — append nếu thiếu, tạo mới `.gitignore` nếu chưa có.

**Config đã tồn tại, không có `--force`** → in thông báo, **exit 0** (idempotent, không phải lỗi). Yêu cầu đang đứng trong git repo (`repoRoot()`) — không phải thì exit 1.

### Output/exit code

`--json` chỉ ở `status` — `server` (Phase 2) import `@squad/core` trực tiếp, không spawn CLI parse output, nên không cần `--json` ở lệnh khác (đúng lý do kiến trúc monorepo được chọn từ đầu).

Exit code phản ánh **kết quả nghiệp vụ**, không phải "process có crash hay không" — để `squad run && squad merge` chain an toàn trong script/CI:

| Lệnh | Exit 1 khi |
|---|---|
| `init` | không ở trong git repo, hoặc không ghi được file (đã tồn tại + không `--force` → exit 0, không phải lỗi) |
| `plan` | `PLAN_INVALID` |
| `run` / `do` | bị chặn bởi conflict gate (không `--force`), hoặc có task nào kết thúc khác `'passed'` (kể cả `'cancelled'`) |
| `merge` | `MergeReport` có bất kỳ entry nào trong `conflicts`/`verifyFailed` |
| `status` / `clean` | chỉ lỗi hệ thống thật (runId không tồn tại, DB không đọc được) |

---

## 3. Phase 2 — `server` (2-3 ngày)

### 3.1 Thiết kế API tối thiểu

```
POST   /repos                     # đăng ký 1 repo local để quản lý
GET    /repos
GET    /repos/:id/runs            # danh sách run của repo — mirror squad status, reuse listRuns()
POST   /repos/:id/plan            # body: { goal } -> trả Plan (chưa chạy)
POST   /repos/:id/runs            # body: { plan } -> tạo run, bắt đầu chạy nền
GET    /runs/:id                  # trạng thái hiện tại + toàn bộ task
GET    /runs/:id/events           # SSE: stream task:log, task:done realtime
POST   /runs/:id/tasks/:taskId/cancel
POST   /runs/:id/merge
```

- Dùng **Fastify** (nhẹ, TS-first, built-in schema validation) thay vì Express — hợp với dự án TS mới, và schema validation của Fastify dùng luôn được type từ `shared-types`.
- SSE (`text/event-stream`) đủ cho use case này — không cần WebSocket vì luồng chủ yếu 1 chiều (server → client), chỉ vài action (cancel/merge) là client → server, dùng POST thường là đủ.
- Server **không giữ state trong RAM là nguồn sự thật** — mọi thứ ghi SQLite trước, event chỉ là thông báo "có gì mới, tự query lại nếu cần". Nguyên tắc này giúp server restart giữa chừng không mất lịch sử.

### 3.2 Definition of Done — Phase 2

- `curl -N http://localhost:PORT/runs/:id/events` thấy log chảy realtime khi chạy 1 plan thật.
- Tắt server giữa chừng 1 run, bật lại, `GET /runs/:id` vẫn trả đúng trạng thái các task đã xong trước đó (nhờ SQLite).
- Có test tích hợp tối thiểu: POST plan → POST run → poll đến khi done → assert status.

---

## Phụ lục E — `server`: registry repo

Chốt trước khi code bước 1-2 Phase 2.

**Lưu trữ**: SQLite riêng tại `~/.squad/registry.db` (override qua env `SQUAD_HOME`, mặc định `~/.squad`) — **không** phải trong bất kỳ repo nào, đối xứng với `<repo>/.squad/`: state riêng 1 repo ở trong repo đó, state "server quản lý nhiều repo nào" ở cấp user.

```sql
CREATE TABLE repos (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  name TEXT,
  added_at TEXT NOT NULL
);
```

**Ranh giới bắt buộc**: `registry.db` chỉ là id→path, không bao giờ lưu run/task/plan — toàn bộ vẫn ở `<repo>/.squad/squad.db`. Trộn 2 trách nhiệm sinh vấn đề đồng bộ giữa 2 nguồn sự thật.

**`POST /repos` idempotent**: path đã đăng ký → trả record đã có (200, không lỗi), cùng nguyên tắc `squad init` gọi lại không `--force` là exit 0 (Phụ lục D), không phải lỗi.

**Validate ngay lúc đăng ký**: path tồn tại, là git repo (`repoRoot()` chạy được), có `squad.config.json` — từ chối ngay nếu thiếu, không đợi tới lúc gọi `/plan` mới lộ lỗi. Cùng nguyên tắc "fail fast tại biên" của Zod (`config.ts`) và `detectCycle()` (`createRunFromPlan()`).

**Port/bind**: mặc định `SQUAD_SERVER_HOST=127.0.0.1` (**không** `0.0.0.0`) — Phase 2 chưa có auth, bind mọi interface sẽ để bất kỳ máy nào cùng mạng gọi được API có khả năng spawn agent CLI chạy lệnh thật trên máy bạn, đây là lỗ hổng thật không phải lý thuyết. `SQUAD_SERVER_PORT=4317` mặc định — tránh dải phổ biến `3000`/`5000`/`8080` dễ trùng dev server khác đang chạy song song (frontend/backend DroneFood chẳng hạn).

**Khởi động server**: gọi `reconcileOrphanedTasks(repoPath)` (xem Phụ lục B) cho **từng repo trong registry**, trước khi bắt đầu nhận request — dọn mọi task mồ côi còn `'running'` từ lần chạy trước bị ngắt giữa chừng.

### Ràng buộc: 1 repo chỉ tối đa 1 run active

**Bắt buộc kiến trúc, không phải tuỳ chọn tránh double-click.** `task.branch` sinh theo `squad/<id>-<slug(title)>`, **không** có `runId` tiền tố (`planner.ts`) — 2 run khác nhau của cùng 1 repo đều sinh `t1`/`t2`... trùng tên, 2 agent ở 2 run sẽ cùng checkout/commit đè lên cùng 1 branch, tranh chấp merge lên `integrationBranch`. `runs.pid` reconcile cũng bị nhiễu nếu 2 run chạy đè. **Phase 3 (web) bắt buộc tuân thủ** — không dựng UI cho phép bấm chạy song song 2 plan trên cùng 1 repo.

`RunsManager` (`packages/server`) giữ 2 map in-memory theo `repoId`: `startingRunsByRepoId` (dedupe request trùng `runId` — cùng `runId` gọi 2 lần → cả 2 chia sẻ 1 in-flight promise, trả `201`+`200`) và `activeRunsByRepoId` (chặn `runId` **khác** khi repo đã có run đang chạy → `409 RUN_ALREADY_ACTIVE`). Check-và-set cả 2 map phải tuyệt đối đồng bộ (không `await` xen giữa đọc và ghi) — cùng kỷ luật đã áp dụng cho `registry.ts` (`INSERT OR IGNORE`). Lock phải được giải phóng đáng tin ở **mọi** nhánh kết thúc (thành công, agent lỗi, exception) — không chỉ nhánh happy path, nếu không repo bị khoá `409` vĩnh viễn tới khi restart server.

### SSE: nối replay (SQLite) và live (EventEmitter) không mất/không trùng

Không tin trực tiếp payload của live listener — chỉ dùng nó làm tín hiệu "có gì mới, query lại DB". `events.id` (auto-increment, đã có sẵn) làm con trỏ đơn điệu:

```
attach live listener trước tiên (không bỏ lọt event xảy ra ngay sau đó, vì
  runner.ts luôn ghi SQLite trước khi emit — Phụ lục B)
lastEventId = 0
flushNewEvents():
  rows = store.listEventsAfter(runId, lastEventId)   # SELECT ... WHERE id > ? ORDER BY id
  với mỗi row: gửi SSE kèm id thật, lastEventId = row.id
gọi flushNewEvents() lần đầu ngay sau khi attach listener
mỗi lần live listener bắn → gọi lại flushNewEvents() (không dùng payload của nó)
```

`flushNewEvents()` phải tuyệt đối không có `await` bên trong (đọc SQLite + `res.write()` đều đồng bộ) — nếu không, 2 lần gọi dồn dập (event live bắn liên tiếp) có thể chồng lên nhau, gửi trùng ngay trong cùng 1 connection. Connect vào 1 run đã xong hẳn (`run:done` đã ghi) phải replay xong rồi đóng connection sạch sẽ, không treo chờ event live không bao giờ tới.

---

## 4. Phase 3 — `apps/web` (Đã hoàn thành 100%)

- **Stack**: React 19 + Vite + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`), kết nối Fastify server (`127.0.0.1:4317`) qua Vite proxy.
- **Ràng buộc "1 Run Active / Repo" (UX-First)**:
  - Khi repo có run `running` hoặc `planned`: Ẩn form tạo plan, hiển thị `ActiveRunBanner` với nút *"Xem tiến độ Run #..."* dẫn thẳng vào Kanban Board, ngăn hoàn toàn lỗi `409 RUN_ALREADY_ACTIVE`.
  - Chỉ hiển thị `PlanCreator` khi repo hoàn toàn rảnh rỗi.
- **Cơ chế Hydration Snapshot-trước-rồi-SSE (`useSquadEvents`)**:
  - Khi mount/F5: Gọi REST `GET /runs/:id` lấy ngay snapshot trạng thái của run và tasks (<100ms) để render board tức thì, không cần tải lại toàn bộ log cũ.
  - Sau đó `EventSource('/runs/:id/events')` nhận live delta. Trình duyệt tự động gửi lại `Last-Event-ID` khi reconnect.
  - Quản lý state bằng `useReducer` tương ứng với `SquadEventDto`, gom các cập nhật `task:log` liên tục thành một lượt render.
- **Chống rò rỉ EventSource khi đổi run**:
  - Cleanup function đồng bộ của `useEffect` hủy `AbortController` và đóng ngay `eventSource.close()`, không để callback cleanup nằm trong Promise handler.
- **Dashboard & Terminal**:
  - Kanban board 4 cột: `Pending`, `Running` (pulsing), `Passed`, `Failed / Cancelled`.
  - Task Card: Role badge, branch, verify command, nút Cancel task.
  - Slide-over Terminal Log Drawer: Dark theme, auto-scroll theo log live, copy log 1-click.
  - Nút "Approve & Merge" hiển thị `MergeModal` với báo cáo `MergeReport` đầy đủ.

### 4.1 Definition of Done — Phase 3
- `pnpm --filter @squad/web build` sinh bundle `dist/` thành công không có lỗi TypeScript hay Vite.
- Đầy đủ test tự động bảo vệ:
  - Unit test `squadReducer` (chuyển array→dict, dồn log chunk, cập nhật status, `isRunEnded`).
  - Lifecycle test `useSquadEvents` (chống rò rỉ EventSource khi đổi `runId` hoặc unmount).
- `pnpm -r test` chạy toàn bộ **72/72 tests pass** (core: 38, cli: 8, server: 14, web: 12).

---

## 5. Phase 4 — Liquid Glass Redesign & Extensions (Đã hoàn thành 100%)

- **Liquid Glass Design System**:
  - Tích hợp hiệu ứng kính mờ (frosted blur, specular border highlight, ambient glows, glass buttons, glass badges, glass cards).
  - Dual Theme: Hỗ trợ chuyển đổi nhanh Dark Mode (Obsidian) và Light Mode (Crystal Milk Glass).
- **Real-Time Server Status**:
  - Hiển thị trên Header: Live latency ping (`ms`) đo round-trip tới `/health`, chấm trạng thái SSE stream, popover chi tiết uptime và repository.
- **Dynamic Agents & Role Customization**:
  - Thêm không giới hạn agent/vai trò tùy chỉnh (Role Key, Display Name, CLI, Model).
  - Tùy biến nhiệm vụ và chỉ dẫn nghiệp vụ riêng (`duty` / prompt guidelines) cho từng vai trò.
- **Skills, MCP & Plugins Hub**:
  - Quản lý MCP Servers (Model Context Protocol) với lệnh và tham số thực thi.
  - Quản lý Skills và Plugins tích hợp trong repo, tự động lưu vào `squad.config.json`.
- **Live Terminal Logs**:
  - Nút CTA `⚡ Xem Live Logs (Agent đang chạy...)` trên thẻ task running.
  - Terminal Drawer với banner `🔴 LIVE STREAMING`, tab chuyển đổi giữa các running tasks, con trỏ terminal nhấp nháy theo thời gian thực.
- **Tùy Biến Làn Kanban**:
  - Bổ sung chế độ xem Làn Ngang (Horizontal Lanes) song song với Cột Dọc (4 Columns Grid), lưu lựa chọn trong `localStorage`.
- **Testing & Stability**:
  - Tăng tổng số bài test lên **84/84 tests pass** trên toàn bộ monorepo (core: 39, cli: 8, server: 18, web: 19).

---

## 6. Việc phụ, làm khi rảnh (không chặn các phase trên)

- Đổi tên nếu định publish npm — `squad` gần chắc đã có người dùng, kiểm tra `npmi view squad` trước khi quyết định (`@silentboiz/squad` là lựa chọn an toàn, scoped name không đụng ai).
- `docs/adr/0001-monorepo-pnpm.md`, `0002-typescript.md` — ghi lại lý do quyết định kiến trúc. Nhỏ nhưng là thứ khiến repo "trông chuyên nghiệp" khi người khác (nhà tuyển dụng) đọc.
- CI: GitHub Actions chạy `pnpm -r test` mỗi push — làm sau khi Phase 1 xong, không làm trước vì chưa có gì để test.

---

## 6. Việc KHÔNG làm ở giai đoạn này (tránh over-engineer)

- Chưa cần auth/multi-user cho `server` — chạy local, 1 người dùng.
- Chưa cần Docker hóa agent (đã bàn ở lần trước) — để riêng, không trộn vào refactor kiến trúc này.
- Chưa cần Turborepo/Nx — 4 package, `pnpm -r` là đủ.
- Chưa cần daemon/background service thật sự — `server` chạy foreground là đủ cho tới khi có nhu cầu cụ thể.
