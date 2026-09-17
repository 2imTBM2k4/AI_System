# Walkthrough: Hoàn thành Phase 3 (`apps/web` - Web UI Dashboard)

Đã hoàn thành toàn bộ ứng dụng web điều phối đa coding agent cho **Squad Orchestrator** theo **Mục 4 của docs/roadmap.md**, **Phụ lục E**, và các quyết định kỹ thuật đã chốt.

---

## 1. Các Tính năng & Quyết định Kỹ thuật Đã Triển khai

### 1.1 Tuân thủ Tuyệt đối Ràng buộc "1 Run Active / Repo" (UX-First)
* Khi người dùng chọn một repository đang có run ở trạng thái `running` hoặc `planned`:
  * **Toàn bộ khu vực form tạo plan mới (`PlanCreator`) bị ẩn đi**, tránh việc người dùng bấm nhầm gây lỗi `409 RUN_ALREADY_ACTIVE`.
  * Thay thế bằng component **`ActiveRunBanner`** hiển thị rõ ràng:
    * Mã Run (ví dụ `#a1b2c3d4`) và trạng thái (`running` / `planned` kèm pulsing animation).
    * Mục tiêu (Goal) của run đang thực thi.
    * Giải thích ràng buộc kiến trúc cô lập Git worktrees theo Phụ lục E.
    * Nút kêu gọi hành động: **"Xem tiến độ Run #... →"** dẫn thẳng vào Kanban Board của run đó.
* Chỉ khi repo hoàn toàn rảnh rỗi (`completed`, `failed` hoặc chưa có run), form `PlanCreator` mới xuất hiện để nhận goal mới.

### 1.2 Khắc phục Triệt để Lỗi Rò rỉ EventSource & Lifecycle trong `useSquadEvents`
* **Vấn đề đã nhận diện**: Trong mã khởi tạo ban đầu, hàm cleanup của EventSource nằm trong callback `.then()` của REST call nên React không bao giờ thực thi khi component unmount hoặc khi `runId` thay đổi. Dẫn đến việc EventSource cũ tiếp tục sống, nhận event và ghi đè state của run mới.
* **Cách sửa chuẩn xác**:
  * Chuyển `eventSource` và `abortController` ra scope của `useEffect`.
  * Hàm cleanup đồng bộ được React gọi trực tiếp:
    ```ts
    return () => {
      active = false;
      abortController.abort(); // Hủy request REST in-flight
      if (eventSource) {
        eventSource.close();   // Đóng ngay lập tức connection EventSource
      }
    };
    ```
  * Dispatch action `INIT_RUN` ngay khi `runId` đổi để reset sạch state và taskLogs cũ, không để lẫn dữ liệu giữa các run.
* **Đã kiểm chứng bằng test tự động**: Test `renderHook` chuyển prop từ `runId = "run-A"` sang `runId = "run-B"` assert chính xác `esRunA.close` được gọi đúng 1 lần!

### 1.3 Khóa Chặt `RunStatus` Union Type giữa Shared-types, Core và Web
* Xác minh giá trị thực tế của `runs.status` trong SQLite store:
  * `'planned'`: Khi run được tạo qua `createPlannedRun`.
  * `'running'`: Khi run được khởi chạy qua `startPlannedRun`.
  * `'completed'`: Khi run hoàn thành tất cả task qua `completeRun`.
  * `'interrupted'`: Khi run mồ côi được phục hồi qua `reconcileOrphanedTasks`.
  * `'failed'`: Khi có lỗi nghiêm trọng cấp run.
  *(Lưu ý: `'cancelled'` là trạng thái của Task, không phải của Run).*
* Khóa chặt union type trong `@squad/shared-types` và `@squad/core`:
  ```ts
  export type RunStatus = 'planned' | 'running' | 'completed' | 'interrupted' | 'failed';
  ```
* Hàm `isRunEnded` được chuẩn hóa:
  ```ts
  export function isRunEnded(run: { status: RunStatus | string; endedAt: string | null }): boolean {
    return run.endedAt !== null || ['completed', 'interrupted', 'failed'].includes(run.status);
  }
  ```

### 1.4 Giao diện Kanban Board & Terminal Drawer
* **Kanban Board 4 Làn**:
  * `Pending`: Các task đang chờ phụ thuộc (`dependsOn`).
  * `Running`: Các task đang được agent code trong worktree (có pulse animation).
  * `Passed`: Các task đã vượt qua lệnh kiểm chứng độc lập.
  * `Failed / Cancelled`: Các task gặp lỗi hoặc bị hủy.
* **Thẻ Task (`TaskCard`)**:
  * Badge vai trò agent (`architect`, `frontend`, `backend`, `tester`).
  * Nhánh Git (`branch`), lệnh kiểm thử (`verify`), lỗi tóm tắt nếu có.
  * Nút **"Hủy Task"** cho các task đang chạy (`POST /runs/:id/tasks/:taskId/cancel`).
* **Terminal Log Drawer (`LogDrawer`)**:
  * Slide-over terminal tối màu (`bg-zinc-950`), font monospace (`JetBrains Mono`).
  * Tự động cuộn xuống cuối khi có log mới theo thời gian thực.
  * Hỗ trợ nút sao chép toàn bộ logs chỉ với 1 click.
* **Quy trình "Approve & Merge" (`MergeModal`)**:
  * Khi toàn bộ task hoàn tất, nút "Approve & Merge" sáng lên.
  * Bấm nút kích hoạt `POST /runs/:id/merge` → hiển thị modal báo cáo chi tiết các branch đã merge, file xung đột nếu có, và task verify fail.

---

## 2. Cấu trúc Thư mục Triển khai (`apps/web`)

```
apps/web/
├── index.html
├── package.json               # React 19, Tailwind v4, Vite 6, @squad/shared-types, Vitest
├── tsconfig.json
├── vite.config.ts             # Proxy /repos & /runs -> http://127.0.0.1:4317 + Vitest happy-dom
├── src/
│   ├── main.tsx
│   ├── App.tsx                # Điều phối chính: Header, Sidebar, ActiveBanner, Kanban
│   ├── index.css              # Tailwind v4 import + base tokens
│   ├── api/
│   │   └── client.ts          # REST client bọc fetch với types từ @squad/shared-types
│   ├── hooks/
│   │   ├── useRepos.ts        # Quản lý danh sách repos, repo đang chọn, phát hiện active run
│   │   └── useSquadEvents.ts  # useReducer hook quản lý snapshot REST + SSE stream delta
│   └── components/
│       ├── layout/
│       │   ├── Header.tsx     # Chọn repo, đăng ký repo mới, backend status indicator
│       │   └── Sidebar.tsx    # Lịch sử các runs cũ của repo
│       ├── plan/
│       │   ├── ActiveRunBanner.tsx  # Banner bảo vệ ràng buộc 1 run active/repo
│       │   ├── PlanCreator.tsx      # Form nhập goal & tạo plan
│       │   └── PlanReviewModal.tsx  # Xem trước tasks, warnings xung đột file, nút Run
│       ├── dashboard/
│       │   ├── KanbanBoard.tsx      # Bảng 4 làn: Pending, Running, Passed, Failed
│       │   ├── TaskCard.tsx         # Thẻ task kèm role, branch, nút Hủy, mở log
│       │   └── MergeModal.tsx       # Báo cáo kết quả sau khi bấm "Approve & Merge"
│       └── terminal/
│           └── LogDrawer.tsx        # Terminal xem live log của từng task
└── test/
    ├── reducer.test.ts        # 9 tests unit cho squadReducer và isRunEnded
    └── useSquadEvents.test.ts # 3 tests vòng đời hook, cleanup EventSource khi đổi runId
```

---

## 3. Kết quả Kiểm thử & Build Toàn Monorepo

1. **Build 100% Sạch sẽ trên Toàn Workspace (`pnpm -r build`)**:
   * `@squad/shared-types`: `tsc -b` pass
   * `@squad/core`: `tsc -b` pass
   * `@squad/cli`: `tsc -b` pass
   * `@squad/server`: `tsc -b` pass
   * `@squad/web`: `tsc -b && vite build` sinh bundle sản phẩm `dist/` thành công (0 warning, 0 error).

2. **Bộ Test Tự động Toàn diện (`pnpm -r test`)**:
   * **72/72 tests passed** trên toàn bộ các package:
     * `@squad/core`: **38/38 tests passed**.
     * `@squad/cli`: **8/8 tests passed**.
     * `@squad/server`: **14/14 tests passed** (concurrency, idempotency, SSE replay monotonic, active run lock).
     * `@squad/web`: **12/12 tests passed** (reducer pure state, log chunk aggregation, EventSource leak prevention on runId change & unmount).
