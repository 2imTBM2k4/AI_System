# @squad/memory

Shared file-based memory package for squad AI agents (Claude, Codex, Gemini, OpenRouter).

Hệ thống bộ nhớ file dùng chung không phụ thuộc vào bất kỳ framework AI hay model cụ thể nào. Lưu trữ dữ liệu dạng Markdown thuần với YAML frontmatter, cho phép các agent giao tiếp, đọc/ghi trạng thái và học hỏi qua nhiều phiên làm việc khác nhau.

---

## 1. Cấu trúc thư mục Memory

Thư mục lưu trữ mặc định: `<repo>/.squad/memory/` (hoặc cấu hình thông qua biến môi trường `SQUAD_MEMORY_DIR`).

```text
.squad/memory/
  index.md                 # Long-term: Tổng quan, quy ước chung toàn squad [Tracked trong Git]
  decisions/<slug>.md      # Long-term: Mỗi quyết định kiến trúc / kỹ thuật 1 file [Tracked trong Git]
  roles/<role>.md          # Role notes: Bài học kinh nghiệm riêng của từng role [Ignored trong Git]
  tasks/<taskId>.md        # Session state: Trạng thái và tiến độ của từng task [Ignored trong Git]
```

> **Quy ước đồng bộ Git (Quyết định D3 đã chốt)**:
> Chỉ commit `index.md` và `decisions/` lên Git để lưu giữ tri thức kiến trúc chung. Thư mục `tasks/` (trạng thái runtime ngắn hạn) và `roles/` (bài học cá nhân của từng agent) được cấu hình loại trừ trong `.gitignore`.

Mỗi file Markdown đều có YAML frontmatter chuẩn:
```yaml
---
name: <slug>
description: <Mô tả ngắn gọn nội dung file>
scope: project | role | task
updatedAt: <ISO 8601 Timestamp>
updatedBy: <Tên agent hoặc role cập nhật>
---

- Fact hoặc ghi chú 1
- Fact hoặc ghi chú 2
```

---

## 2. Cài đặt và Thiết lập

```bash
# Cài đặt qua pnpm workspace
pnpm add @squad/memory

# Build package
pnpm -F @squad/memory build

# Chạy kiểm thử
pnpm -F @squad/memory test
```

Biến môi trường tùy chọn:
- `SQUAD_MEMORY_DIR`: Đường dẫn tuyệt đối hoặc tương đối tới thư mục lưu trữ memory (mặc định `.squad/memory/`).

---

## 3. Sử dụng CLI `squad-mem`

Bất kỳ agent hoặc script shell nào cũng có thể gọi CLI:

### Bắt đầu phiên làm việc (Start Session)
Ghép ngữ cảnh từ `index.md`, `roles/<role>.md`, và `tasks/<taskId>.md`:
```bash
squad-mem start --task task-101 --role backend --max-chars 8000
```

### Thêm ghi chú / bài học (Append Memory)
Thêm một dòng fact vào file (tự động tạo file kèm frontmatter nếu chưa có, an toàn concurrency nhiều process):
```bash
# Lưu bài học vào role
squad-mem append roles/backend.md "Sử dụng atomicWrite để tránh corrupt file khi crash" --by gemini-agent

# Lưu quyết định dùng chung
squad-mem append decisions/file-locks.md "Dùng open wx kết hợp stale lock detection" --by claude-agent
```

### Đọc tài liệu Memory (Read)
```bash
squad-mem read decisions/file-locks.md
```

### Ghi tài liệu từ Stdin (Write Stdin)
```bash
cat new-memory.md | squad-mem write decisions/architecture.md --stdin
```

### Liệt kê tài liệu (List)
```bash
# Liệt kê tất cả
squad-mem list

# Lọc theo scope (project, role, task)
squad-mem list --scope role
```

### Tìm kiếm (Search)
Tìm kiếm chuỗi con không phân biệt hoa thường trong nội dung:
```bash
squad-mem search "concurrency"
```

### Kết thúc phiên làm việc (End Session)
Ghi nhận tiến độ công việc đã xong và việc còn lại vào `tasks/<taskId>.md`:
```bash
squad-mem end --task task-101 --role backend --done "Xong storage layer và unit tests" --remaining "Triển khai CLI"
```

---

## 4. Quy tắc kiểm soát quyền ghi & Allowlist đường dẫn

Hệ thống bộ nhớ áp dụng cơ chế bảo vệ phân quyền chặt chẽ ở cả tầng TypeScript API và CLI:

### Allowlist đường dẫn ghi (Write Path Allowlist)
Mọi thao tác ghi (`write`, `append`, `delete`) chỉ chấp nhận đúng 2 định dạng hợp lệ:
1. **`index.md`**: Đại diện cho quy ước dài hạn của dự án do chủ dự án quản trị. Mọi thao tác ghi/sửa/xóa từ agent đều bị từ chối tuyệt đối với thông báo:
   ```text
   index.md is read-only for agents; edit it manually
   ```
   (Exit code khác 0, không có tùy chọn bypass).
2. **`<decisions|roles|tasks>/<id>.md`**:
   - Tên thư mục bắt buộc viết thường chính xác: `decisions`, `roles`, hoặc `tasks`.
   - `<id>` bắt buộc tuân theo whitelist `[A-Za-z0-9_-]`, độ dài tối đa 64 ký tự, và không trùng tên thiết bị cấm trên Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1..9`, `LPT1..9`).
   - Đuôi file bắt buộc là `.md`.

**Mọi dạng đường dẫn khác đều bị từ chối**:
- Thư mục viết hoa hoặc lẫn chữ hoa: `Roles/pm.md`, `ROLES/pm.md`, `Decisions/d1.md`.
- Dấu chấm/nhảy thư mục tương đối: `./roles/pm.md`, `roles/./pm.md`, `decisions/../index.md`, `./index.md`.
- Dấu gạch chéo ngược Windows: `roles\pm.md`, `decisions\d1.md`.
- Ký tự NTFS Alternate Data Stream: `roles/pm.md::$DATA`.
- Ký tự kết thúc bằng dấu chấm hoặc khoảng trắng: `index.md.`, `index.md `, `roles/pm.md.`.
- Thư mục lồng nhau hoặc tùy ý: `decisions/a/b.md`, `notes/todo.md`.

Đường dẫn ghi thật trên đĩa được sinh ra từ chính canonical path đã qua allowlist (không sử dụng trực tiếp chuỗi do người dùng/agent nhập). Các thao tác đọc (`read`, `list`, `search`, `start`) không bị chặn bởi allowlist này.

### Kiểm soát vai trò `--by` cho `roles/<x>.md`
- Thao tác `write`, `append`, `delete` vào `roles/<x>.md` bắt buộc phải có `--by <agent>`.
- Chỉ cho phép chỉnh sửa nếu `--by` trùng khớp với `<x>` (ví dụ: `roles/pm.md` chỉ có thể được ghi bởi `--by pm`). Mọi hành vi ghi chéo vai trò đều bị từ chối.
- Các tài liệu trong `decisions/` và `tasks/` không bị ràng buộc bởi quy tắc `--by`.

---

## 5. Sử dụng TypeScript API

Có thể import trực tiếp vào backend/orchestrator:

```typescript
import {
  readMemory,
  writeMemory,
  appendMemory,
  listMemories,
  searchMemory,
  deleteMemory,
  startSession,
  endSession,
} from '@squad/memory';

// 1. Nạp context cho phiên làm việc
const context = await startSession({
  taskId: 'task-101',
  role: 'architect',
  maxChars: 8000,
});

// 2. Thêm một fact
await appendMemory(
  'roles/architect.md',
  'Luôn validate đường dẫn chống path traversal',
  {
    updatedBy: 'gemini-agent',
    description: 'Quy ước bảo mật hệ thống',
  }
);

// 3. Đọc memory
const doc = await readMemory('roles/architect.md');
if (doc) {
  console.log(doc.frontmatter);
  console.log(doc.content);
}

// 4. Kết thúc phiên
await endSession({
  taskId: 'task-101',
  role: 'architect',
  done: 'Hoàn thành đặc tả kiến trúc',
  remaining: 'Chờ review từ squad',
});
```

---

## 6. Cơ chế an toàn và Hạn chế (Safety & Limitations)

- **Atomic Writes**: Ghi vào file tạm `.tmp` cùng thư mục rồi đổi tên (`rename`), ngăn chặn tình trạng file nửa vời do crash giữa chừng.
- **Path Traversal Protection**: `resolveSafePath` chặn triệt để `../`, đường dẫn tuyệt đối, và symlink/junction trỏ ra ngoài root memory.
- **Cross-process Locking**: Cơ chế `withFileLock` sử dụng cờ `open('wx')` với PID staleness detection và xử lý contention tương thích Windows/POSIX, hỗ trợ an toàn khi nhiều OS process cùng ghi đồng thời.
- **Bảo vệ Token khi Release**: Mỗi lock file chứa một UUID token duy nhất. Tiến trình chỉ xóa lock file nếu token trong file khớp với token ban đầu của mình, tránh việc tiến trình giữ lock quá lâu vô tình xóa mất lock mới của tiến trình khác sau khi bị cướp lock.
- **Hạn chế quan trọng: Stale theo tuổi khi tiến trình còn sống vi phạm loại trừ lẫn nhau (Mutual Exclusion Violation)**:
  - Nếu một tiến trình giữ lock thực hiện tác vụ quá lâu (vượt quá `staleMs`, mặc định 30 giây) hoặc bị đóng băng tạm thời (GC pause dài, I/O tắc nghẽn) nhưng PID vẫn còn sống, cơ chế stale detection sẽ coi lock này đã hết hạn và cho phép một tiến trình khác cướp quyền (reclaim) để tránh treo hệ thống (deadlock).
  - **Hạn chế kỹ thuật**: Hành vi này chấp nhận đánh đổi và **vi phạm nguyên lý loại trừ lẫn nhau (mutual exclusion)** nếu tiến trình ban đầu tỉnh dậy và tiếp tục thực hiện ghi đĩa cùng lúc với tiến trình mới.
  - **Khuyến nghị**: Mọi tác vụ nằm bên trong `withFileLock` (như appendMemory, update frontmatter) phải là các tác vụ CPU/Disk I/O cục bộ cực nhanh (< 1-2 giây), không được nhúng các network call chậm hoặc tác vụ người dùng/agent suy luận kéo dài vào trong scope lock.
- **Khoảng hở TOCTOU (Time-Of-Check to Time-Of-Use) khi dọn Stale Lock**:
  - Khi một tiến trình phát hiện lock file đã stale tại thời điểm kiểm tra (TOC) và chuẩn bị gọi `unlink` để dọn dẹp, hệ thống đã đọc lại file để đối chiếu token nhằm tránh xóa nhầm lock mới.
  - Tuy nhiên, trên hệ thống tập tin cục bộ không có thao tác nguyên tử (atomic compare-and-swap delete) ở cấp kernel, vẫn tồn tại một khoảng hở nano/micro-giây (TOCTOU) giữa lần đọc đối chiếu token cuối cùng và lệnh `unlink`. Nếu một tiến trình khác cướp lock và ghi file thành công đúng trong tích tắc này, lệnh `unlink` vẫn có thể xóa nhầm lock mới đó. Đây là giới hạn cố hữu của cơ chế lock dựa trên file thuần túy không có tiến trình điều phối trung tâm (daemon).
