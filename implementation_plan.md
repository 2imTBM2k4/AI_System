# Kế hoạch triển khai Phase 3: Web UI Dashboard (`apps/web`)

Tài liệu thiết kế chi tiết triển khai ứng dụng web cho **Squad Orchestrator** theo **Mục 4 của docs/roadmap.md**, **Phụ lục E**, và các quyết định kỹ thuật đã chốt.

---

## 1. Mục tiêu & Nguyên tắc Thiết kế

Xây dựng ứng dụng web hiện đại (`apps/web`) bằng **React 19 + Vite + TypeScript + Tailwind CSS**, kết nối trực tiếp với Fastify backend (`http://127.0.0.1:4317`), nhập trực tiếp types từ `@squad/shared-types`.

### 3 Quyết định Cốt lõi Đã Chốt:
1. **Tuân thủ Tuyệt đối Ràng buộc "1 Run Active / Repo" (UX-First)**:
   - Không chỉ disable nút "Run" khiến user bối rối.
   - Khi chọn một repo đang có run active (`running` hoặc `planned`): **Ẩn toàn bộ form tạo plan**, thay thế bằng **`ActiveRunBanner`** thông báo rõ ràng: *"Repo đang có Run #<id> đang chạy — Xem tiến độ"* và dẫn thẳng vào Dashboard Kanban của run đó.
   - Chỉ hiển thị form "Tạo Plan mới" khi repo hoàn toàn rảnh rỗi.
2. **Cơ chế Hydration: Snapshot-trước-rồi-SSE (`GET /runs/:id` + EventSource Delta)**:
   - Khi load lại trang (F5) giữa lúc run đang chạy: Gọi `GET /runs/:id` để lấy snapshot trạng thái của run và toàn bộ tasks ngay lúc mount. Board Kanban hiển thị tức thì (<100ms) mà không phải replay hàng nghìn dòng `task:log`.
   - Sau đó, `EventSource` chỉ nhận delta các event tiếp theo. Log chi tiết chỉ fetch/stream khi người dùng mở panel log của task tương ứng.
3. **SSE Reconnect Native qua Browser + `useReducer` cho `useSquadEvents`**:
   - Tận dụng cơ chế chuẩn của trình duyệt: `EventSource` tự động gửi lại header `Last-Event-ID` khi reconnect; không tự huỷ/tạo lại `EventSource` mỗi lần component re-render.
   - Dùng `useReducer` với action type tương ứng với `SquadEventDto` (Phụ lục B), gộp nhiều update vào một lần render, tránh re-render dồn dập khi log bắn liên tục.
4. **Styling: Tailwind CSS**:
   - Sử dụng Tailwind CSS với bộ utility class trực quan cho Kanban board (4 làn màu theo `TaskStatus`), badge vai trò agent, và terminal log drawer tối màu.

---

## 2. Kiến trúc State & Luồng Dữ liệu Frontend

```mermaid
graph TD
    User([Developer / User]) --> WebApp[React App - Port 5173]
    WebApp -->|Vite Proxy /repos, /runs| Server[Fastify Server - Port 4317]
    
    subgraph RepoView[Repo Selection & Active Run Guard]
        RepoSelect[Chọn Repo] --> CheckActive{Có run running/planned?}
        CheckActive -->|Có| ActiveBanner[Hiển thị ActiveRunBanner\nẨn Form Plan]
        ActiveBanner -->|Click| ViewActiveRun[Mở Kanban của Run đang chạy]
        CheckActive -->|Không| PlanForm[Hiển thị Form Tạo Plan Mới]
    end

    subgraph RunDashboard[Run Execution Dashboard]
        Mount[Mount Dashboard runId] --> Step1[1. GET /runs/:id\nLấy Snapshot Task Status]
        Step1 --> DispatchSnap[Dispatch SNAPSHOT_LOADED]
        Step1 --> Step2[2. new EventSource('/runs/:id/events')\nNative reconnect với Last-Event-ID]
        Step2 --> EventDelta[Nhận live SSE events]
        EventDelta --> Reducer[useSquadEvents Reducer]
        Reducer --> KanbanState[(Kanban Board State)]
        KanbanState --> KanbanUI[Render 4 Cột Kanban]
        KanbanState --> LogDrawer[Terminal Drawer khi click Task]
    end
```

---

## 3. Thiết kế Chi tiết Thành phần & Kỹ thuật

### 3.1 `useSquadEvents`: Quản lý State bằng `useReducer`

```typescript
// apps/web/src/hooks/useSquadEvents.ts

export interface SquadState {
  run: RunRecordDto | null;
  tasks: Record<string, TaskRecordDto>;
  logs: Record<string, string[]>; // taskId -> mảng log chunks
  warnings: FileConflictDto[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
}

export type SquadAction =
  | { type: 'SNAPSHOT_LOADED'; payload: RunDetailResponse }
  | { type: 'SSE_CONNECTED' }
  | { type: 'SSE_ERROR'; error: string }
  | { type: 'EVENT_RECEIVED'; event: SquadEventDto };
```

#### Quy tắc Reducer:
* `SNAPSHOT_LOADED`: Nạp snapshot ban đầu từ `GET /runs/:id`, gán `run` và chuyển danh sách `tasks: TaskRecordDto[]` thành từ điển `Record<string, TaskRecordDto>`.
* `EVENT_RECEIVED`:
  * `task:start`: Cập nhật `tasks[taskId].status = 'running'` và `startedAt`.
  * `task:log`: Đẩy `chunk` vào mảng `logs[taskId]`.
  * `task:done`: Cập nhật `tasks[taskId].status = result.status`, `endedAt`, `error`.
  * `run:done`: Cập nhật trạng thái `run.status = 'completed'`, đóng SSE.

#### Lifecycle Effect:
```typescript
useEffect(() => {
  if (!runId) return;
  let active = true;

  // 1. Fetch snapshot từ REST
  fetchRunDetail(runId)
    .then((data) => {
      if (!active) return;
      dispatch({ type: 'SNAPSHOT_LOADED', payload: data });
      
      // Nếu run đã kết thúc, không cần mở SSE
      if (data.run.endedAt || ['completed', 'failed', 'cancelled'].includes(data.run.status)) {
        return;
      }

      // 2. Mở SSE stream nhận delta (EventSource giữ nguyên suốt lifecycle của runId)
      const es = new EventSource(`/runs/${runId}/events`);
      es.onopen = () => dispatch({ type: 'SSE_CONNECTED' });
      es.onerror = () => dispatch({ type: 'SSE_ERROR', error: 'Mất kết nối SSE, trình duyệt đang thử kết nối lại...' });
      es.onmessage = (ev) => {
        try {
          const event: SquadEventDto = JSON.parse(ev.data);
          dispatch({ type: 'EVENT_RECEIVED', event });
          if (event.type === 'run:done') {
            es.close();
          }
        } catch (err) {
          console.error('Lỗi parse SSE:', err);
        }
      };

      return () => {
        es.close();
      };
    })
    .catch((err) => {
      if (active) dispatch({ type: 'SSE_ERROR', error: err.message });
    });

  return () => {
    active = false;
  };
}, [runId]);
```

---

### 3.2 Ràng buộc "1 Run Active / Repo" trên Giao diện (`ActiveRunBanner`)

* Khi chọn một repo, hook `useRepoRuns(repoId)` gọi `GET /repos/:id/runs`.
* Tìm kiếm run gần nhất: `const activeRun = runs.find(r => r.status === 'running' || r.status === 'planned');`
* **Nếu `activeRun` tồn tại**:
  * **Ẩn form tạo plan** (người dùng không thể nhập goal hoặc bấm tạo plan mới).
  * Hiển thị component **`ActiveRunBanner`**:
    * **Tiêu đề**: ⚠️ *Repo đang có Run đang thực thi*
    * **Thông tin**: Run `#${activeRun.id.slice(0, 8)}` • Mục tiêu: `"${activeRun.goal}"` • Trạng thái: `<Badge status={activeRun.status} />`
    * **Action**: Nút `"Xem tiến độ & Điều phối →"` chuyển tab thẳng sang **Kanban Board** của `activeRun.id`.
    * **Giải thích**: Chú thích rõ *"Theo ràng buộc an toàn của Squad Orchestrator, mỗi repo chỉ được thực thi tối đa 1 run tại một thời điểm để tránh xung đột worktree và branch."*
* **Nếu repo rảnh rỗi**:
  * Hiển thị `PlanCreator` (nhập goal, nút "Lập kế hoạch").

---

### 3.3 Giao diện Kanban Board & Terminal Drawer

1. **Kanban Board (4 Cột trực quan)**:
   * **Pending** (Xám/Slate): Tasks đang chờ phụ thuộc (`dependsOn`).
   * **Running** (Vàng/Amber, pulsing indicator): Tasks đang được agent code trong worktree.
   * **Passed** (Xanh lá/Emerald): Tasks đã pass verify command.
   * **Failed / Cancelled** (Đỏ/Rose): Tasks gặp lỗi verify hoặc đã bị cancel.
2. **Thẻ Task (`TaskCard`)**:
   * Badge vai trò agent (`architect`, `frontend`, `backend`, `tester`).
   * Danh sách file phân công (`files`).
   * Lệnh kiểm thử (`verify`).
   * Nút **"Hủy (Cancel)"** đối với các task đang ở trạng thái `running` (gọi `POST /runs/:id/tasks/:taskId/cancel`).
   * Click vào card để mở **Log Drawer**.
3. **Log Drawer (Terminal)**:
   * Thanh trượt từ cạnh phải hoặc dưới màn hình.
   * Nền đen sâu (`bg-zinc-950`), chữ monospace font chữ nhỏ, tự động cuộn xuống cuối khi có log mới (`task:log`).
   * Nút copy log và nút đóng drawer.
4. **Hành động Kết thúc: "Approve & Merge"**:
   * Khi tất cả tasks đều đã hoàn thành (không còn task `running` hay `pending`).
   * Hiển thị nút nổi bật **"Approve & Merge vào nhánh chính"**.
   * Bấm nút gọi `POST /runs/:id/merge` → hiển thị modal báo cáo `MergeReport` (danh sách branch đã merge thành công, xung đột nếu có, các task bị verify fail).

---

## 4. Danh mục File & Cấu trúc Dự án

### Cập nhật Workspace Config:
#### [MODIFY] [pnpm-workspace.yaml](file:///c:/Users/Admin/Documents/Working/AI_System/pnpm-workspace.yaml)
* Thêm `'apps/*'` vào workspace:
  ```yaml
  packages:
    - 'packages/*'
    - 'apps/*'
  ```

#### [MODIFY] [tsconfig.json](file:///c:/Users/Admin/Documents/Working/AI_System/tsconfig.json)
* Thêm project reference `{ "path": "./apps/web" }`.

---

### Dự án Mới: `apps/web`

#### [NEW] [apps/web/package.json](file:///c:/Users/Admin/Documents/Working/AI_System/apps/web/package.json)
* Dependencies:
  * `react`, `react-dom`
  * `@squad/shared-types`: `"workspace:*"`
  * `lucide-react` (icon UI sắc nét)
* DevDependencies:
  * `vite`, `@vitejs/plugin-react`
  * `tailwindcss` (v4), `@tailwindcss/vite`
  * `typescript`, `@types/react`, `@types/react-dom`

#### [NEW] [apps/web/vite.config.ts](file:///c:/Users/Admin/Documents/Working/AI_System/apps/web/vite.config.ts)
* Cấu hình `@tailwindcss/vite` và proxy:
  ```typescript
  export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/repos': 'http://127.0.0.1:4317',
        '/runs': 'http://127.0.0.1:4317',
      },
    },
  });
  ```

#### [NEW] Mã nguồn Frontend:
1. `apps/web/src/index.css`: `@import "tailwindcss";` + dark theme base tokens.
2. `apps/web/src/api/client.ts`: Định nghĩa các hàm gọi API REST: `listRepos`, `registerRepo`, `listRuns`, `createPlan`, `startRun`, `getRunDetail`, `cancelTask`, `mergeRun`.
3. `apps/web/src/hooks/useSquadEvents.ts`: `useReducer` hook quản lý snapshot REST + SSE delta stream.
4. `apps/web/src/hooks/useRepos.ts`: Quản lý danh sách repository, repo đang được chọn, và run active.
5. `apps/web/src/components/layout/Header.tsx`: Thanh điều hướng, chọn repo, modal đăng ký repo mới, trạng thái kết nối backend.
6. `apps/web/src/components/layout/Sidebar.tsx`: Lịch sử các run trước đó của repo, trạng thái badge.
7. `apps/web/src/components/plan/ActiveRunBanner.tsx`: **Component mấu chốt** — hiển thị cảnh báo run active, chặn tạo plan trùng lặp, nút xem tiến độ.
8. `apps/web/src/components/plan/PlanCreator.tsx`: Form nhập goal, nút tạo plan (chỉ hiển thị khi không có run active).
9. `apps/web/src/components/plan/PlanReviewModal.tsx`: Xem trước các tasks được agent planner đề xuất, kiểm tra xung đột file (`warnings`), nút xác nhận "Run".
10. `apps/web/src/components/dashboard/KanbanBoard.tsx`: 4 làn công việc (Pending, Running, Passed, Failed).
11. `apps/web/src/components/dashboard/TaskCard.tsx`: Thẻ task với badge trạng thái, role, verify cmd, nút Cancel.
12. `apps/web/src/components/dashboard/MergeModal.tsx`: Hiển thị kết quả sau khi bấm "Approve & Merge".
13. `apps/web/src/components/terminal/LogDrawer.tsx`: Terminal drawer xem live log cho từng task.
14. `apps/web/src/App.tsx`: Ghép nối các thành phần hoàn chỉnh.

---

## 5. Kế hoạch Kiểm thử & Xác minh

### 1. Build & Typecheck:
* Chạy `pnpm -r build` đảm bảo toàn bộ workspace (bao gồm `shared-types`, `core`, `cli`, `server`, và `apps/web`) build không có bất kỳ lỗi TypeScript hay bundling nào.

### 2. Kiểm thử Tích hợp & UX (End-to-End):
1. **Kiểm tra Ràng buộc 1 Run Active**:
   * Khởi động `packages/server` trên cổng 4317 và `apps/web` trên cổng 5173.
   * Chọn repo đang chạy một run: Xác nhận form "Tạo Plan" biến mất hoàn toàn, `ActiveRunBanner` xuất hiện với nút "Xem tiến độ".
   * Không thể kích hoạt thêm run nào khác trên repo này từ UI.
2. **Kiểm tra Snapshot + F5 Refresh**:
   * Khi một run đang chạy: Bấm F5 trên trình duyệt.
   * Xác nhận trang khôi phục ngay lập tức trạng thái của toàn bộ tasks từ `GET /runs/:id` mà không bị trắng trang hay chờ replay log.
   * `EventSource` tiếp tục nhận các event mới sau khi load lại.
3. **Kiểm tra Thao tác Huỷ Task & Merge**:
   * Bấm nút "Cancel" trên một task đang chạy -> Task chuyển sang trạng thái `cancelled`.
   * Khi toàn bộ task hoàn tất -> Nút "Approve & Merge" hiển thị -> Bấm merge -> Báo cáo `MergeReport` xuất hiện đầy đủ thông tin.
