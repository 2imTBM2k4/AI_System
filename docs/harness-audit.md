# Squad Harness Audit Report (Task 0)

*Ngày thực hiện: 2026-09-23*  
*Đối chiếu trực tiếp với mã nguồn thực tế tại: `c:\Users\Admin\Documents\Working\AI_System`*

---

## 1. Tóm tắt kết quả Audit theo từng cơ chế

| Cơ chế / Field | Tình trạng hiện tại trong repo | Đánh giá | Chi tiết & Khoảng cách (Gap) |
|---|---|---|---|
| **1. Worktree Isolation** (`executionMode`) | Đã có trong `packages/core/src/runner.ts` (`createWorktree`, `removeWorktree`, `git worktree list --porcelain`, fallback prune). | **Đã có nhưng chưa đủ** | Cơ chế tạo/dọn cơ bản hoạt động tốt. Cần bổ sung: quét và dọn worktree mồ côi khi server khởi động lại hoặc khi task bị cancel/crash ngoài ý muốn; bảo đảm chế độ `worktree` chạy độc lập hoàn toàn với `direct`. |
| **2. Khoá đồng thời & Concurrency** (`maxParallel`) | `config.maxParallel` được điều phối qua batch chunking & dependencies trong `runner.ts`. `store.ts` quản lý state trong SQLite. | **Đã có nhưng chưa đủ** | Đã có throttle giới hạn số task chạy song song (`maxParallel`), nhưng **chưa có file lock `flock()`** (`.squad/locks/<taskId>.lock`) để ngăn chặn việc 2 process worker cùng tranh chấp 1 task khi restart hoặc mở rộng multi-process. |
| **3. Permission Allowlist theo vai trò** | 8 file persona tại `agents/*.md` (`backend`, `frontend`, `mobile`, `database`, `pm`, `techlead`, `qa`, `devops`). | **Chưa có, cần viết mới** | Các persona markdown mô tả trách nhiệm bằng ngôn ngữ tự nhiên nhưng chưa có schema dữ liệu (`roleAllowlist` với paths & commands) và chưa có hook chặn cứng vi phạm trước khi thực thi. |
| **4. Timeout & Kill-Switch** (`timeoutMinutes`) | Đã có trong `squad.config.json` và `spawnProcess` trong `runner.ts` (`setTimeout` gọi `child.kill()`). | **Đã có nhưng chưa đủ** | Timeout kill cơ bản đã có, nhưng trên Windows `child.kill()` không diệt toàn bộ cây tiến trình (process tree / shell subprocesses), và **chưa có `maxToolCalls`** (ngắt khi agent lặp tool quá số lần cho phép). |
| **5. Hook Layer (PreToolUse / PostToolUse)** | Chưa có hook framework chặn trước khi tool/lệnh shell được thực thi. | **Chưa có, cần viết mới** | Cần xây dựng Hook Layer trong `@squad/core` (hoặc middleware server), hỗ trợ đồng bộ `allow` / `deny` kèm log lý do rõ ràng. |
| **6. Deterministic Verify Gate** (`verify: []`) | Config hiện có field `"verify": []`. Runner có code chạy `verifyCommand` ở cuối task và trong QA loop. | **Đã có nhưng chưa đủ** | Runner đã có logic đọc và thực thi chuỗi lệnh `verify`, nhưng config hiện đang rỗng. Cần bổ sung các lệnh chuẩn (`pnpm lint`, `pnpm test`, `pnpm build`) và tích hợp vòng lặp dev agent tự sửa lỗi kỹ thuật trước khi chuyển sang QA LLM. |
| **7. Acceptance Test Contract** | TechLead tạo API Contract trong prompt/planning. | **Chưa có, cần viết mới** | Cần cơ chế cho phép đính kèm file acceptance test nghiệp vụ (chỉ đọc đối với dev agent) vào task contract, và có flag cấu hình `requireAcceptanceTest`. |
| **8. Mailbox liên Agent** | Chưa có. | **Hoãn (Deferred)** | Vì API Contract đã đóng vai trò hợp đồng chung giữa 4 dev agent song song, nhu cầu mailbox chưa cấp thiết. Hoãn theo đúng chỉ dẫn của plan v2. |
| **9. Append-only Event Log** | Đã có bảng `events` (SQLite AUTOINCREMENT) và SSE stream trong `store.ts` & `runs.ts`. | **Đã có, mở rộng thêm** | Nền tảng SQLite + SSE event đã hoạt động tốt. Cần bổ sung thêm các event type mới cho các hành động an toàn: `worktree:create/cleanup`, `lock:acquired/released`, `hook:decision`, `verify:gate`. |

---

## 2. Kết luận & Đề xuất phương án thực hiện

1. **Bảo toàn tính ổn định:** Giữ nguyên 90/90 tests hiện có qua monorepo, không xóa bỏ chế độ `executionMode: "direct"`.
2. **Kế hoạch triển khai:**
   - **Phase A (An toàn & Cô lập):**
     - Task 1: Nâng cấp cleanup worktree mồ côi và bảo vệ crash.
     - Task 2: Triển khai file lock `flock` / mutex non-blocking trên `.squad/locks/`.
     - Task 3: Định nghĩa `roleAllowlist` cho 8 vai trò (Backend, Frontend, Mobile, Database, DevOps, etc.).
     - Task 4: Nâng cấp process tree killing trên Windows và bổ sung `maxToolCalls` kill-switch.
   - **Phase B (Chất lượng & Hook):**
     - Task 5: Triển khai Hook Layer (`PreToolUse`, `PostToolUse`) tích hợp Allowlist.
     - Task 6: Cấu hình `verify` tất định (`pnpm lint`, `pnpm test`) làm gate kỹ thuật trước khi gọi QA LLM.
     - Task 7: Tích hợp Acceptance Test Contract gắn với TechLead API contract (read-only cho dev).
   - **Phase C (Mở rộng & Quan sát):**
     - Task 8: Hoãn theo khuyến nghị của spec.
     - Task 9: Mở rộng các event types trong `store.ts` cho toàn bộ lifecycle mới và bổ sung API/CLI xem audit log.
