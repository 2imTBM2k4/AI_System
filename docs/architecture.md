# Squad Phase 1 architecture

## Package boundary

`@squad/core` chứa cơ chế điều phối: đọc config, tạo plan, chạy agent trong Git
worktree, lưu SQLite, và merge có kiểm chứng. Core không in terminal hoặc gọi
`process.exit`.

`@squad/cli` chỉ là consumer của core: tìm Git repository hiện tại, mở config
và SQLite, subscribe event để in terminal, áp policy CLI (`--force`, exit code),
và thực hiện các thao tác filesystem của `init`/`clean`.

## Event schema

`SquadOrchestrator` kế thừa `EventEmitter` và phát các event sau:

| Event | Payload | Khi phát |
| --- | --- | --- |
| `plan:start` | `goal` | Trước khi gọi planner agent |
| `plan:log` | `chunk` | Khi planner ghi stdout/stderr |
| `plan:done` | `runId`, `plan`, `warnings` | Sau khi Plan hợp lệ đã được ghi SQLite với status `planned` |
| `run:start` | `runId`, `plan` | Sau khi run và task record đã được tạo |
| `task:start` | `runId`, `taskId` | Sau khi task đổi sang `running` |
| `task:log` | `runId`, `taskId`, `chunk` | Sau khi log chunk đã append vào SQLite |
| `task:done` | `runId`, `result` | Sau khi kết quả task đã được lưu |
| `run:done` | `runId`, `results` | Sau khi run hoàn tất đã được lưu |

Quy tắc đồng bộ là **ghi SQLite trước, emit sau**. Điều này cho phép listener
query ngay trong handler mà vẫn thấy state mới. `plan:start` và `plan:log`
không được lưu vào bảng `events` vì xảy ra trước khi planner sinh được `runId`;
`plan:done` được emit sau khi row `runs` đã tồn tại.

Mọi agent process nhận prompt qua argv và stdin được đóng ngay sau `spawn()`.
Đây là bắt buộc cho CLI non-interactive: một số CLI (như `codex exec`) sẽ chờ
stdin EOF ngay cả khi prompt đã có trong argv.

## SQLite schema

Database nằm tại `cfg.dbFile`, mặc định `.squad/squad.db`.

```sql
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  repo_path TEXT NOT NULL,
  goal TEXT NOT NULL,
  plan_json TEXT,
  pid INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE tasks (
  id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  branch TEXT NOT NULL,
  log_path TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  error TEXT,
  pid INTEGER,
  PRIMARY KEY (id, run_id)
);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  task_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
```

`runs.plan_json` là snapshot đầy đủ của Plan, gồm `dependsOn`; nhờ đó một
process khác có thể chạy hoặc merge theo `runId` mà không giữ state trong RAM.
`events` lưu event có `runId` để server Phase 2 có thể replay log task qua SSE.
`clean` không xóa bất cứ row nào trong ba bảng này.

`runs.pid` là PID của process điều phối đang sở hữu run; `tasks.pid` là PID
của child process đang chạy task. Khi bắt đầu run, core ghi `runs.pid` trong
cùng transaction chuyển `planned` sang `running`; sau mỗi lần spawn, core ghi
`tasks.pid` trước log/event đầu tiên. Kết thúc task hoặc run sẽ xóa PID tương
ứng. `reconcileOrphanedTasks(repoPath)` chỉ xét `runs.pid`: PID đã chết làm
mọi task còn `pending`/`running` chuyển sang `interrupted` và kết thúc run.
Do đó cleanup được phép xử lý worktree của run bị ngắt, còn merge vẫn chỉ nhận
task `passed`.

## Lifecycle

1. `squad plan` gọi `makePlan()`: planner agent tạo Plan, core validate rồi
   ghi run `planned`; CLI lưu cùng Plan ở `cfg.planFile`.
2. `squad run` không có ID đọc file Plan, validate JSON, sau đó
   `createRunFromPlan()` tự kiểm tra graph dependency trước khi ghi run mới.
   Có ID thì load `plan_json` từ SQLite.
3. CLI gọi lại `fileConflicts()` ngay trước `runPlan()`. Conflict chỉ được
   chạy khi có `--force`.
4. `runPlan()` tạo worktree/branch riêng cho mỗi task, chạy theo dependency và
   không tự merge. Mỗi task kết thúc bằng commit riêng khi passed; task bị
   cancel vẫn cố commit WIP.
5. `squad merge <runId>` chỉ merge task `passed` theo topo order vào
   `integrationBranch`. Conflict abort và verify fail reset đúng merge commit,
   nhưng branch còn lại vẫn tiếp tục.
6. `squad clean` chỉ xóa worktree đã kết thúc; branch chỉ bị thử xoá với
    `--delete-branches` bằng `git branch -d`. Branch chưa merge được giữ lại
    và không chặn cleanup worktree hay task khác.
7. Mỗi lệnh CLI mở runtime đều chạy reconciliation trước. Server Phase 2 sẽ
   chạy cùng cơ chế cho từng repo trong registry trước khi nhận request.
