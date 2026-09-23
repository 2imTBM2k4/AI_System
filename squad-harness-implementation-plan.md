# Squad — Task Execution Harness: Implementation Plan (v2 — đã đối chiếu với repo thật)

**Mục tiêu:** nâng cấp squad (repo: github.com/2imTBM2k4/AI_System) để agent thực thi task chính xác, an toàn, không làm gãy workflow — theo mô hình các cơ chế đã được kiểm chứng trong harness của Claude Code, điều chỉnh xuống quy mô 1 người dùng / dự án cá nhân.

**Đối tượng đọc tài liệu này:** agent triển khai (Antigravity). Tài liệu mô tả **spec & tiêu chí hoàn thành (Definition of Done)**, không cố định số dòng/tên file cụ thể.

**v2 khác v1 ở đâu:** v1 viết dựa trên giả định kiến trúc "task chung chung". Sau khi đối chiếu với README thật của repo, kiến trúc thực tế là pipeline 8 vai trò cố định với QA reject loopback, và `squad.config.json` đã có sẵn nhiều field liên quan. v2 sửa lại Task 1/2/3/4/6/7/8 cho khớp thực tế, và thêm **Task 0 — audit bắt buộc** trước khi code bất kỳ task nào.

---

## 0. Bối cảnh hệ thống thật (xác nhận từ README, không phải giả định)

**Kiến trúc pipeline:** Client → (B0: làm rõ yêu cầu nếu chưa rõ) → **PM** (đánh giá khả thi & timeline) → **TechLead** (kiến trúc & ban hành **API Contract**) → 4 vai trò chạy **song song**: **Backend / Frontend / Mobile / Database** → **QA** (kiểm thử theo business rules, quyết định PASS hoặc REJECT) → nếu REJECT: quay lại 4 dev song song (reject loopback) → nếu PASS: **DevOps** (build, env, đóng gói) → bàn giao.

Persona của 8 vai trò nằm ở `agents/*.md` (pm.md, techlead.md, backend.md, frontend.md, mobile.md, database.md, qa.md, devops.md), tự do chỉnh sửa. Có cơ chế alias: `pm↔planner`, `qa↔tester↔reviewer`, `techlead↔architect`.

**Monorepo:**
```
agents/            # 8 file persona .md
packages/
  core/             # runner.ts (điều phối Git Worktrees / Direct execution & QA Loopback), store.ts (SQLite + SSE)
  cli/              # squad plan / run / merge / clean
  server/           # Fastify REST + SSE + /health
  shared-types/     # DTOs, schemas, pipeline contracts dùng chung
apps/web/           # React 19 + Vite + Tailwind dashboard (Kanban-style, Live Terminal Logs qua SSE)
docs/
squad.config.json   # config trung tâm
```

**squad.config.json hiện tại (đã có sẵn — KHÔNG viết mới các field này, chỉ audit + hoàn thiện nếu cần):**
```json
{
  "worktreeDir": ".squad/worktrees",
  "dbFile": ".squad/squad.db",
  "planFile": ".squad/plan.json",
  "logDir": ".squad/logs",
  "maxParallel": 3,
  "timeoutMinutes": 30,
  "executionMode": "direct",
  "maxReviewRounds": 2,
  "verify": []
}
```
- `executionMode` có 2 giá trị: `"direct"` (in-place) và chế độ worktree cô lập — UI web đã có màn "Cài Đặt Dự Án" cho phép chọn. → **Task 1 audit trước, không viết mới.**
- `timeoutMinutes` đã tồn tại ở config + UI. → **Task 4 audit trước.**
- `maxParallel` đã tồn tại. → cơ chế khoá thực thi đằng sau nó chưa rõ, cần audit. → **Task 2 audit trước.**
- `maxReviewRounds: 2` + QA reject loopback: QA là **agent LLM** ra quyết định PASS/REJECT theo business rules, khác với gate tất định (lint/test/build). → **Task 6 bổ trợ, không thay thế QA agent.**
- `verify: []` đang **rỗng** — đây là chỗ để cắm lệnh verify tất định vào. → **Task 6 điền vào đây.**

**9Router:** gateway local (`http://127.0.0.1:20128/v1`) gom nhiều tài khoản AI, cân bằng tải, chống rate-limit 429. Đây là **service ngoài squad**, không thuộc scope sửa đổi của plan này — hook layer (Task 5) phải nằm trong `packages/core`/`packages/server`, không đụng vào 9Router.

**Test hiện tại (từ README, xác nhận trước khi code):** 87/87 — `@squad/core` 43, `@squad/server` 18, `@squad/cli` 8, `@squad/web` 18.

**Nguyên tắc ưu tiên khi có trade-off** (áp dụng cho mọi quyết định trong plan này): độ phức tạp triển khai > hiệu năng > chi phí > khả năng mở rộng. Nếu Antigravity gặp điểm cần đánh đổi ngoài phạm vi đã quyết ở dưới, **dừng lại và hỏi Minh**, không tự chọn.

**Ngoài phạm vi (out-of-scope) cho toàn bộ plan:**
- Container/Docker isolation (dùng git worktree, không dùng container).
- ML classifier cho permission (dùng allowlist tĩnh).
- Multi-tenant / nhiều người dùng đồng thời.
- Sửa đổi 9Router hoặc logic multi-account/rate-limit của nó.

---

## Task 0 — Audit bắt buộc (làm TRƯỚC mọi task khác, không được bỏ qua)

**Mục tiêu:** xác định chính xác cái gì đã có (chỉ cần hoàn thiện) và cái gì chưa có (cần viết mới), tránh viết đè lên logic đang chạy tốt và tránh phá vỡ 87/87 test hiện có.

**Việc cần làm:**
1. Đọc `packages/core/src/runner.ts` — xác nhận: `executionMode: "worktree"` đã tạo/dọn git worktree thật chưa, xử lý ra sao khi crash giữa chừng, có tương đương cơ chế reconcile task mồ côi không.
2. Đọc `packages/core/src/store.ts` — xác nhận: schema SQLite hiện tại của task/run, có bảng event dạng append-only cho SSE không, cơ chế khoá đồng thời (nếu có) đứng sau `maxParallel` là gì.
3. Đọc cách `timeoutMinutes` được dùng trong runner — chỉ set giá trị hiển thị UI, hay có logic kill thật khi task chạy quá giờ.
4. Đọc cách field `verify` (hiện `[]`) được đọc trong runner/server — đã có code xử lý mảng này chưa hay chỉ khai báo type ở `shared-types`.
5. Đọc `agents/backend.md`, `frontend.md`, `mobile.md`, `database.md` — xác nhận ranh giới thư mục/scope của từng vai trò đã được ghi rõ trong persona chưa (để Task 3 map allowlist theo đúng ranh giới thật, không tự bịa).
6. Đọc route của `packages/server` liên quan tới QA reject loopback — xác nhận luồng thật của `maxReviewRounds`.

**Output bắt buộc trước khi sang Task 1:** 1 ghi chú ngắn (comment trong PR hoặc file `docs/harness-audit.md`) liệt kê rõ, theo từng field/cơ chế ở trên: "đã có, hoạt động đúng" / "đã có nhưng chưa đủ (nêu thiếu gì)" / "chưa có, cần viết mới". Các task bên dưới đều giả định output audit này tồn tại — nếu audit phát hiện sai lệch lớn so với mô tả trong plan, Antigravity dừng lại hỏi Minh trước khi tiếp tục.

---

## Phase A — Nền tảng cô lập & an toàn cơ bản

### Task 1: Hoàn thiện worktree isolation (không viết mới nếu đã có)

**Phụ thuộc:** Task 0.

**Spec:**
- Nếu audit xác nhận `executionMode: "worktree"` đã hoạt động đúng cơ bản: chỉ cần bổ sung phần còn thiếu theo checklist DoD dưới, KHÔNG viết lại cơ chế tạo worktree từ đầu.
- Nếu audit phát hiện chưa có (hoặc chỉ là field cấu hình chưa nối logic): tạo `git worktree add <path> -b squad/task-<taskId>` từ commit HEAD của `baseBranch` khi 1 task được giao cho dev agent (Backend/Frontend/Mobile/Database), path nằm dưới `worktreeDir` đã khai báo trong config — không tạo trong working tree chính.
- Khi task hoàn tất (PASS/REJECT-đã-chuyển-lại/fail), worktree phải được dọn — kể cả khi process crash giữa chừng.

**DoD:**
- Test: 2 vai trò (ví dụ Backend + Frontend) chạy song song trên cùng 1 lần chạy plan không đụng file của nhau khi `executionMode: "worktree"`.
- Test: worktree bị dọn sau khi task xong (mọi trạng thái kết thúc, không chỉ PASS).
- Test: giả lập crash giữa chừng → worktree mồ côi được dọn khi hệ thống khởi động lại.
- Không phá vỡ 87/87 test hiện có, đặc biệt 43 test của `@squad/core`.

**Rủi ro:** nếu `executionMode: "direct"` đang là default và nhiều logic khác trong runner giả định chạy in-place, việc ép buộc worktree cho mọi task có thể phá luồng hiện có — giữ nguyên 2 chế độ như config đã thiết kế, không xoá chế độ `direct`.

---

### Task 2: Khoá đồng thời giữa các vai trò chạy song song

**Phụ thuộc:** Task 0.

**Spec:**
- Nếu audit xác nhận `maxParallel` đã có cơ chế khoá đủ tốt (ví dụ qua SQLite transaction hoặc in-memory map đúng cách) — chỉ bổ sung 1 lớp `flock()` cấp file như lớp phòng thủ độc lập thứ 2 (mục đích: phòng trường hợp server restart nhưng process worker cũ vẫn giữ task — kịch bản khoá in-memory/SQLite thuần không tự phát hiện được).
- Nếu audit phát hiện `maxParallel` chỉ là giới hạn số lượng chạy đồng thời (throttle) mà KHÔNG có cơ chế khoá chống 2 agent cùng nhận 1 task cụ thể, cần bổ sung cả 2: khoá logic (registry/SQLite) lẫn `flock()` file (`.squad/locks/<taskId>.lock`, non-blocking `LOCK_EX|LOCK_NB`).
- Giải phóng lock khi task hoàn tất hoặc khi phát hiện task bị bỏ rơi.

**DoD:**
- Test: 2 process cùng cố nhận 1 task đồng thời (spawn 2 child process thật) → chỉ 1 process thành công.
- Test: kill -9 process đang giữ task → hệ thống phát hiện và cho phép nhận lại.
- Không phá vỡ hành vi `maxParallel` hiện có (số task chạy đồng thời tối đa vẫn đúng theo config).

---

### Task 3: Permission allowlist theo vai trò (role-based, không phải theo task rời rạc)

**Phụ thuộc:** Task 0 (đọc `agents/*.md` để lấy đúng ranh giới thư mục mỗi vai trò).

**Spec:**
- Vì kiến trúc đã chia rõ theo domain (Backend/Frontend/Mobile/Database), allowlist nên gắn theo **vai trò**, không phải theo từng task:
  ```
  roleAllowlist:
    backend:   { paths: ["<đúng theo audit agents/backend.md>"], commands: [...] }
    frontend:  { paths: [...], commands: [...] }
    mobile:    { paths: [...], commands: [...] }
    database:  { paths: [...], commands: [...] }
  ```
- `pm`, `techlead`, `qa`, `devops` không cần allowlist ghi file theo path cụ thể (vai trò của họ là điều phối/đánh giá/build, không sửa code nghiệp vụ trực tiếp) — nhưng vẫn cần allowlist **lệnh shell** được phép chạy (ví dụ devops chỉ được chạy lệnh build/docker đã khai báo, không chạy lệnh tuỳ ý).
- Router chặn **trước khi** gửi lệnh xuống CLI thực thi (qua 9Router hoặc CLI trực tiếp). Path/lệnh ngoài allowlist bị từ chối, có log lý do rõ ràng — không im lặng bỏ qua.
- Mức tối giản: 2 mode — `restricted` (mặc định) và `full` (debug thủ công).

**DoD:**
- Test: agent `backend` cố ghi file thuộc phạm vi `frontend` → bị chặn.
- Test: agent `devops` cố chạy lệnh ngoài danh sách build/docker đã khai báo → bị chặn.
- Test: mọi vai trò thao tác đúng phạm vi của mình → không bị ảnh hưởng.

**Rủi ro:** nếu `agents/*.md` hiện tại không ghi rõ ranh giới thư mục (chỉ mô tả trách nhiệm bằng lời), Antigravity cần tự suy ra từ cấu trúc thực tế của các dự án mẫu đã chạy qua squad, hoặc hỏi Minh xác nhận ranh giới trước khi hard-code allowlist.

---

### Task 4: Hoàn thiện timeout / kill-switch

**Phụ thuộc:** Task 0.

**Spec:**
- Nếu audit xác nhận `timeoutMinutes` đã kill task thật khi quá giờ (kèm dọn worktree, giải phóng lock) — chỉ cần bổ sung thêm giới hạn thứ 2: `maxToolCalls` (số lượt gọi tool/lệnh tối đa) nếu chưa có, vì thời gian không phải lúc nào cũng bắt được agent loop vô nghĩa mà vẫn còn trong hạn giờ.
- Nếu audit phát hiện `timeoutMinutes` mới chỉ là con số cấu hình chưa nối logic kill: viết logic thật — khi chạm giới hạn, set trạng thái tương đương "interrupted"/"timeout", kill process con, dọn worktree (Task 1), giải phóng lock (Task 2).

**DoD:**
- Test: task giả lập chạy quá `timeoutMinutes` → bị dừng, worktree/lock được dọn, trạng thái phản ánh đúng nguyên nhân (khác với fail thông thường).
- Test: task giả lập vượt `maxToolCalls` (nếu bổ sung) → tương tự.
- Test: task hoàn thành trong giới hạn bình thường → không bị ảnh hưởng.
- Không phá vỡ 87/87 test hiện có.

---

## Phase B — Đảm bảo chất lượng & đúng phạm vi

### Task 5: Hook layer trong router (PreToolUse-style)

**Phụ thuộc:** Task 3.

**Spec:**
- Đặt trong `packages/core` hoặc `packages/server` (KHÔNG đặt trong 9Router — đó là service ngoài, ngoài phạm vi).
- 2 loại hook tối thiểu: `PreToolUse` (trước khi ghi file/chạy lệnh), `PostToolUse` (log/audit sau khi thực thi).
- Input: `taskId`, `role` (backend/frontend/...), loại hành động, nội dung. Output: `allow` / `deny` (kèm lý do). Bỏ `ask` (tạm dừng chờ người) ở bản đầu tiên nếu tốn công — ghi rõ trong code là chưa hỗ trợ.
- Allowlist theo vai trò (Task 3) trở thành 1 hook cụ thể đăng ký vào layer này, không hard-code riêng.
- Chạy đồng bộ, chặn thực thi tới khi có kết quả.

**DoD:**
- Test: hook `deny` → hành động không thực thi, agent nhận lỗi rõ ràng.
- Test: hook `allow` → chạy bình thường.
- Test: allowlist theo vai trò (Task 3) hoạt động đúng khi chạy qua hook layer.
- Rà toàn bộ đường agent có thể thực thi hành động (CLI, server, 9Router call-through) để đảm bảo không có đường nào bỏ qua hook.

---

### Task 6: Quality gate tất định — điền vào field `verify` đang rỗng

**Phụ thuộc:** Task 1 (worktree để chạy test cô lập), Task 5.

**Spec:**
- Điền nội dung thật vào `verify` trong `squad.config.json` (ví dụ `["pnpm lint", "pnpm test", "pnpm build"]`), và viết logic trong runner đọc + chạy mảng này trong worktree của task **trước khi** chuyển sang bước QA agent đánh giá business rules.
- Nếu `verify` fail → task quay lại cho đúng dev agent tự sửa, tính vào `maxReviewRounds` hiện có (dùng chung bộ đếm với QA reject loopback, không tạo bộ đếm riêng — tránh 2 vòng lặp retry chồng chéo nhau).
- Nếu `verify` pass → mới chuyển cho QA agent đánh giá logic nghiệp vụ (PASS/REJECT) như luồng hiện tại.
- **Quan trọng:** gate này KHÔNG thay thế QA agent — chỉ lọc lỗi kỹ thuật trước, để QA agent tập trung đánh giá đúng business rules thay vì phải bắt cả lỗi lint/test cơ bản.

**DoD:**
- Test: task có code fail `verify` → không tới được bước QA agent, quay lại dev agent, tính đúng vào `maxReviewRounds`.
- Test: task pass `verify` → chuyển tiếp bình thường tới QA agent như luồng cũ.
- Test: vượt `maxReviewRounds` (dù do verify fail hay QA reject) → chuyển trạng thái cần Minh can thiệp thủ công, không tự lặp vô hạn.
- Không phá vỡ luồng QA reject loopback hiện có (audit ở Task 0 phải xác nhận điều này trước).

**Rủi ro:** nếu lệnh test phụ thuộc state ngoài worktree (DB chung, port cố định) thì 2 dev agent chạy song song sẽ đụng nhau khi verify cùng lúc — audit Task 0 cần kiểm tra điều này.

---

### Task 7: Task contract — mở rộng từ API Contract sẵn có của TechLead

**Phụ thuộc:** Task 6.

**Spec:**
- TechLead đã ban hành **API Contract** làm phần của pipeline hiện tại — tận dụng artifact này làm nền, không viết cơ chế "acceptance test" hoàn toàn tách biệt.
- Bổ sung: cùng với API Contract, TechLead (hoặc PM) đính kèm tối thiểu 1 test acceptance phản ánh đúng business rules cho mỗi phần việc giao xuống Backend/Frontend/Mobile/Database — test này nằm trong `verify` (Task 6) và **dev agent không được phép sửa file test acceptance** (thêm rule vào allowlist Task 3: file test acceptance chỉ đọc).
- Nếu 1 task không có acceptance test kèm theo, hệ thống cảnh báo (không bắt buộc chặn cứng ngay từ đầu) — điều khiển bằng 1 flag cấu hình để Minh bật/tắt.

**DoD:**
- Test: dev agent cố sửa file acceptance test → bị chặn bởi allowlist.
- Test: acceptance test fail dù lint/build pass → vẫn tính là chưa xong, không chuyển tới QA agent.
- Test: task có `requireAcceptanceTest` bật nhưng thiếu test đính kèm → cảnh báo rõ khi TechLead ban hành contract.

---

## Phase C — Mở rộng (có thể hoãn nếu chưa cần)

### Task 8: Mailbox giữa các agent — độ ưu tiên đã hạ thấp

**Điều kiện triển khai:** vì API Contract của TechLead đã đóng vai trò hợp đồng chung giữa 4 dev agent chạy song song, nhu cầu mailbox thời gian thực **thấp hơn dự kiến ban đầu**. **Chỉ làm task này nếu** thực tế phát sinh: 1 dev agent cần đổi 1 phần contract giữa lúc đang chạy và cần báo ngay cho các dev agent khác (ví dụ Backend đổi field response giữa chừng, Frontend/Mobile cần biết ngay). Nếu chưa gặp tình huống này trong thực tế sử dụng, **bỏ qua task**, không code trước.

**Spec (nếu triển khai):** mỗi agent có hộp thư (bảng registry hoặc JSONL riêng). **Ranh giới bắt buộc giữ:** 1 agent không được duyệt permission prompt thay agent khác qua mailbox; hành động đã bị hook/allowlist (Task 3/5) từ chối không được "nhờ" agent khác làm hộ để lách qua.

---

### Task 9: Mở rộng append-only event log cho task/run

**Xác nhận từ README:** `store.ts` đã làm "Lưu trữ SQLite & sự kiện SSE" — nền tảng append-only đã tồn tại (audit Task 0 xác nhận chi tiết schema). Task này **mở rộng**, không xây mới.

**Spec:**
- Đảm bảo mọi thay đổi trạng thái phát sinh từ Task 1–8 (worktree tạo/dọn, lock claim/release, hook allow/deny, verify pass/fail, reject loopback, timeout) đều ghi thành 1 event mới — không update field trạng thái tại chỗ mà không kèm event.
- Không xoá/sửa event cũ — cần "sửa" thì ghi thêm event mới, không mutate event cũ.
- Thêm lệnh CLI hoặc endpoint đọc lịch sử event đầy đủ của 1 task/run theo thời gian, phục vụ debug.

**DoD:**
- Test: mọi hành động ở Task 1–8 tạo đúng ít nhất 1 event tương ứng.
- Test: không có đường code nào set status mà bỏ qua ghi event (audit toàn bộ nơi status được set).
- Test: SSE hiện có (Live Terminal Logs, Kanban dashboard ở apps/web) vẫn hoạt động đúng — không phá vỡ 18 test của `@squad/web`.

---

## Ghi chú cuối cho Antigravity

1. **Bắt buộc làm Task 0 (audit) trước tiên** — không được giả định plan này đúng 100% với code thật cho tới khi tự đọc và xác nhận. Nếu audit phát hiện sai lệch lớn so với mô tả ở mục 0, dừng lại hỏi Minh trước khi tiếp tục các task khác.
2. **Không tự quyết định trade-off ngoài những gì đã chốt trong plan này** (đổi cơ chế khoá, đổi số permission mode, đổi ngưỡng timeout mặc định, gộp/tách vòng lặp retry của Task 6 với `maxReviewRounds` sẵn có) — dừng lại hỏi Minh trước khi code tiếp.
3. **Giới hạn đã biết của Task 6:** gate `verify` chỉ bắt lỗi kỹ thuật, không đảm bảo đúng logic nghiệp vụ — đó là lý do QA agent (đã có sẵn) vẫn giữ vai trò đánh giá cuối cùng, gate này không thay thế QA agent, và cũng không thay thế review thủ công của Minh trước khi merge thật.
4. Sau mỗi task hoàn thành, tóm tắt rõ đã thay đổi gì để xử lý case gì, liệt kê từng case/edge case đã test kèm kết quả — không chỉ nói chung "đã test xong".
5. Comment hàm bằng tiếng Anh, tên biến/hàm tiếng Anh hoàn toàn — không có yêu cầu code style cụ thể khác.
