# Squad Harness — Danh sách lỗi cần sửa (từ review code thật)

Tài liệu này liệt kê các lỗi phát hiện khi đối chiếu trực tiếp `runner.ts`, `hooks.ts`, `lock.ts`, `permissions.ts`, `direct-runner.mjs`, `squad.config.json` — không phải giả định, mọi mục đều trích dẫn đúng đoạn code có vấn đề.

**Thứ tự trong tài liệu = thứ tự ưu tiên sửa.** Mục 1–3 là lỗi bảo mật/logic thật, nên sửa trước khi làm thêm tính năng gì khác. Mục 4–5 là dọn dẹp. Mục 6 là điểm cần Minh quyết định, không phải lỗi.

---

## 1. [Bắt buộc] `permissions.ts` — fail-open khi role không xác định (bỏ qua toàn bộ allowlist)

**File:** `packages/core/src/permissions.ts`
**Hàm:** `validateFileAccess`, `validateCommandAccess`

**Vị trí lỗi:**
```ts
const policy = DEFAULT_ROLE_POLICIES[role.toLowerCase()];
if (!policy) {
  // Unrestricted for unlisted/custom roles
  return { allowed: true };
}
```

**Nguyên nhân:** `DEFAULT_ROLE_POLICIES` chỉ định nghĩa 8 role (`backend/frontend/mobile/database/devops/pm/techlead/qa`). Role không có trong danh sách này (ví dụ `default`, `planner`, `reviewer`, `tester`) sẽ được coi là **không giới hạn**.

**Đường khai thác thật:** trong `runner.ts`, vòng lặp QA review (`runQAReviewLoop`) parse `fixTasks` từ output JSON của QA agent bằng `role: t.role || 'default'`. Nếu QA quên điền `role` trong JSON trả về (hoàn toàn có thể vì đây là output tự do của LLM), task sửa lỗi đó chạy với `role = 'default'` → `validateFileAccess`/`validateCommandAccess` trả `allowed: true` ngay lập tức, bỏ qua toàn bộ allowlist — ghi được bất kỳ file nào (kể cả `squad.config.json`, `package.json`), chạy bất kỳ lệnh nào.

**Cách sửa:** đổi sang fail-closed — role không có trong `DEFAULT_ROLE_POLICIES` bị từ chối mặc định, không phải được phép mặc định:
```ts
const policy = DEFAULT_ROLE_POLICIES[role.toLowerCase()];
if (!policy) {
  return {
    allowed: false,
    reason: `No permission policy defined for role '${role}'. Refusing by default (fail-closed).`,
  };
}
```
Nếu có role thật sự cần chạy không giới hạn (ví dụ vai trò điều phối nội bộ), phải khai báo tường minh trong `DEFAULT_ROLE_POLICIES` với `paths: ['**/*']` — không dựa vào nhánh mặc định ngầm.

**Cách xác nhận đã sửa đúng:** viết test gọi `validateFileAccess('default', 'squad.config.json', ...)` và `validateFileAccess('nonexistent-role', 'anything', ...)` — cả 2 phải trả `allowed: false`. Đồng thời test `runQAReviewLoop` với `fixTasks` thiếu field `role` → task đó phải bị từ chối ở bước hook, không được thực thi.

---

## 2. [Bắt buộc] `runner.ts` — không kiểm tra file thực sự bị ghi, chỉ kiểm tra danh sách khai báo trước

**File:** `packages/core/src/runner.ts`
**Hàm:** `executeTask`

**Nguyên nhân:** `HookPipeline.executePreHooks` với `actionType: 'file_write'` chỉ chạy cho từng file trong `task.files` — danh sách do TechLead/planner khai báo **trước khi** agent chạy. Nhưng việc ghi file thật nằm trong `direct-runner.mjs` (`extractAndWriteFiles`), dựa trên regex tách từ text LLM trả về tự do — model có thể trả về khối `FILE: <path ngoài phạm vi>` mà không có gì chặn lại, vì `direct-runner.mjs` chỉ tự bảo vệ `package.json`/`squad.config.json`, không kiểm tra theo allowlist vai trò.

Sau khi agent chạy xong, `executeTask` có gọi `listChangedFiles(targetDir)` để lấy `changedFiles`, nhưng chỉ dùng để lưu vào `TaskResult.changedFiles` cho mục đích hiển thị — **không đối chiếu lại với allowlist**.

**Cách sửa:** ngay sau dòng gọi `listChangedFiles(targetDir)` (trong nhánh `status === 'passed'`, trước khi `commitAll`), thêm bước kiểm tra từng file trong `changedFiles` qua `validateFileAccess(task.role, file, targetDir, mode, task.acceptanceTests ?? [])`. Nếu có bất kỳ file nào vi phạm:
- Đổi `status` thành `'agent_failed'` (hoặc thêm status mới, ví dụ `'scope_violation'`, để phân biệt rõ với lỗi kỹ thuật thông thường trong log/dashboard).
- Rollback thay vì commit — dùng lại đúng nhánh xử lý đã có sẵn cho trường hợp không `passed` (`rollbackWorkingTree` cho direct mode, `removeWorktree` cho worktree mode).
- Ghi 1 event mới (ví dụ `hook:post_violation`) kèm danh sách file vi phạm, để việc này hiện được trên dashboard/log giống các event `hook:evaluated` khác.

**Cách xác nhận đã sửa đúng:** viết test giả lập 1 task role `backend` nhưng `direct-runner.mjs` (mock) trả về khối `FILE: apps/web/src/App.tsx` — task phải kết thúc với trạng thái vi phạm, thay đổi phải được rollback, không được commit vào worktree/nhánh chính.

---

## 3. [Bắt buộc] `runner.ts` — `killProcessTree` không diệt hết process con trên Linux/Mac

**File:** `packages/core/src/runner.ts`
**Hàm:** `killProcessTree`, `spawnProcess`

**Vị trí lỗi:**
```ts
export function killProcessTree(pid) {
  ...
  } else {
    try {
      process.kill(-pid, 'SIGKILL');   // gửi tới process GROUP
    } catch { ... }
  }
}
```
```ts
const child = spawn(executable, args, {
  cwd,
  env: { ...process.env, ...env },
  shell,
  windowsHide: true,          // KHÔNG có detached: true
});
```

**Nguyên nhân:** `process.kill(-pid, ...)` (dấu `-` phía trước) gửi tín hiệu tới cả process group, nhưng cách này chỉ hoạt động đúng nếu process con được spawn với `detached: true` (để nó trở thành group leader riêng, tách khỏi group của process cha). Hiện tại `spawn()` không có `detached: true`, nên trên Linux/Mac khi timeout kích hoạt và gọi `killProcessTree`, có thể chỉ kill được đúng process con trực tiếp (ví dụ `pnpm`) mà **không kill được các process cháu** nó đẻ ra (node test runner con, process build con...) → để lại process mồ côi chạy ngầm sau khi task đã bị coi là "hết giờ" (timeout).

Trên Windows không bị ảnh hưởng vì nhánh đó dùng `taskkill /F /T /PID` (đã có flag `/T` diệt cả cây tiến trình đúng cách).

**Cách sửa:** thêm `detached: true` vào `spawn()` khi không phải Windows:
```ts
const child = spawn(executable, args, {
  cwd,
  env: { ...process.env, ...env },
  shell,
  windowsHide: true,
  detached: process.platform !== 'win32',
});
```
Lưu ý: khi thêm `detached: true`, cần đảm bảo Node process cha không tự thoát trước khi child kết thúc bình thường (không set `child.unref()`), vì `detached` chỉ tách process group, không tách lifecycle theo dõi.

**Cách xác nhận đã sửa đúng:** test trên Linux/Mac — spawn 1 lệnh sinh thêm tiến trình con (ví dụ script chạy `sleep 100 &` bên trong), cho task timeout, sau đó kiểm tra bằng `ps` không còn tiến trình `sleep` nào sót lại sau khi `killProcessTree` chạy.

---

## 4. [Nên làm] `permissions.ts` — so khớp lệnh theo tiền tố thay vì chính xác

**File:** `packages/core/src/permissions.ts`
**Hàm:** `validateCommandAccess`

**Vị trí lỗi:**
```ts
const isAllowed = policy.allowedCommands.some((allowed) => {
  const cleanAllowed = allowed.toLowerCase();
  return baseCmd === cleanAllowed || baseCmd.startsWith(cleanAllowed);
});
```

**Nguyên nhân:** `baseCmd.startsWith(cleanAllowed)` khiến 1 binary có tên bắt đầu trùng tiền tố (ví dụ giả định có `gitx` hoặc `pnpmfoo` tồn tại trên máy) cũng được coi là hợp lệ vì khớp tiền tố với `git`/`pnpm`. Đây là lỗi logic rõ ràng dù rủi ro thực tế thấp trên máy cá nhân.

**Cách sửa:**
```ts
const isAllowed = policy.allowedCommands.some(
  (allowed) => baseCmd === allowed.toLowerCase(),
);
```

**Cách xác nhận đã sửa đúng:** test `validateCommandAccess('backend', 'gitxyz status', 'restricted')` phải trả `allowed: false` (trước khi sửa sẽ trả `true` do khớp tiền tố `git`).

---

## 5. [Dọn dẹp] `squad.config.json` — field `maxToolCalls` không có tác dụng, nên bỏ

**File:** `squad.config.json`

**Nguyên nhân:** `direct-runner.mjs` (nơi thực thi agent) không phải 1 agent loop nhiều bước (gọi model → gọi tool → lặp) — nó chỉ gửi **đúng 1 lần** `fetch()` tới endpoint completion, nhận text, tách file bằng regex, ghi ra đĩa, rồi kết thúc. Không có khái niệm "nhiều lượt gọi tool trong 1 task" để đếm. Đã rà toàn bộ `runner.ts` và `direct-runner.mjs`, không có chỗ nào đọc field `maxToolCalls`.

**Cách sửa:** xoá field `"maxToolCalls": 50` khỏi `squad.config.json` để tránh gây hiểu lầm là có kill-switch dựa trên số lượt gọi tool trong khi thực tế không có. Rủi ro "agent lặp vô hạn" mà field này từng nhắm tới không áp dụng được với kiến trúc single-shot hiện tại — rủi ro thật duy nhất là 1 lần `fetch()` bị treo, đã được `timeoutMinutes` xử lý đúng qua cơ chế `setTimeout` bọc `spawnProcess`.

Nếu sau này Minh muốn có agent loop nhiều bước thật (agent tự quyết định gọi lại model để sửa lỗi trong cùng 1 task, không phải qua toàn bộ vòng QA review), đó là thay đổi kiến trúc lớn hơn, cần thiết kế riêng — không phải chỉ thêm lại field này.

**Cách xác nhận đã sửa đúng:** không cần test, chỉ cần xác nhận field đã bị xoá khỏi config và không còn tham chiếu tới `maxToolCalls` ở bất kỳ đâu trong codebase (`grep -r maxToolCalls`).

---

## 6. [Cần Minh quyết định — không phải lỗi để tự sửa] Allowlist lệnh chỉ chặn được tên chương trình, không chặn tham số

**File:** `packages/core/src/permissions.ts`

**Vấn đề:** mọi role (kể cả `backend`, `frontend`) đều có `node`, `npx`, `pnpm` trong `allowedCommands`. Việc kiểm tra dừng ở tên binary đầu dòng lệnh, không xem xét tham số theo sau. Vì `node -e "<code bất kỳ>"` và `npx <package bất kỳ trên npm>` đều chạy được, về lý thuyết mọi role đều có khả năng thực thi mã tuỳ ý thông qua các lệnh "được phép" này.

**Đây không phải lỗi cần Antigravity tự sửa** — với threat model đã thống nhất (1 người dùng, agent là LLM có thể lệch hướng chứ không phải kẻ tấn công chủ đích, đã loại trừ container isolation/ML classifier khỏi phạm vi), mức bảo vệ hiện tại có thể chấp nhận được. Antigravity **không tự quyết định** thay đổi phần này.

**Nếu Minh muốn chặt hơn**, 2 phương án (đưa cho Antigravity chọn sau khi Minh quyết định hướng nào):
- **A — chặn tham số nguy hiểm cụ thể:** thêm danh sách "forbidden argument patterns" cho từng lệnh (ví dụ chặn `node` khi có `-e`/`--eval`, chặn `npx` khi package không nằm trong 1 danh sách con cho phép). Độ phức tạp thấp, không chặn được hết nhưng chặn được các cách lạm dụng phổ biến nhất.
- **B — giữ nguyên hiện trạng [Minh đã quyết định chọn]:** chấp nhận mức bảo vệ này là đủ cho quy mô dự án cá nhân, ghi chú rõ trong code/docs đây là giới hạn đã biết (known limitation), không phải lỗ hổng bị bỏ sót. Đã cập nhật ghi chú giải thích chi tiết trong docstring hàm `validateCommandAccess` tại `packages/core/src/permissions.ts`.

---

## Ghi chú cho Antigravity

- Sửa mục 1–3 **trước**, không gộp chung với việc thêm tính năng mới — đây là vá lỗ hổng an toàn trong hệ thống đang chạy, cần review kỹ từng thay đổi.
- Sau mỗi mục sửa xong, báo cáo theo đúng format: nguyên nhân → cách sửa → kết quả → cách test đã chạy (liệt kê case cụ thể, không chỉ nói chung "đã test xong").
- Mục 6 chỉ trình bày phương án, **không tự chọn A hay B** — chờ Minh quyết định trước.
- Không phá vỡ bộ test hiện có khi sửa — chạy lại toàn bộ `pnpm -r test` sau mỗi mục và báo cáo số liệu thật (không dùng số liệu cũ từ báo cáo trước).