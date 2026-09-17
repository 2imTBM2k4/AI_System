# Squad — quy tắc làm việc

Dự án monorepo pnpm workspaces + TypeScript, điều phối nhiều coding agent
(Claude/Codex/Gemini) chạy song song trên git worktree. Xem chi tiết kiến
trúc và roadmap 3 phase tại `docs/roadmap.md` — LUÔN đọc file đó trước khi
bắt đầu bất kỳ task nào, kể cả khi task nghe có vẻ đơn giản.

## Quy trình bắt buộc

1. Trước khi code: xác nhận lại đang ở đúng phase nào trong roadmap, task
   nào trong phase đó. Nếu yêu cầu của tôi không khớp rõ với một mục trong
   roadmap, hoặc thiếu thông tin để quyết định — HỎI LẠI trước, không tự
   giả định rồi làm luôn.
2. Khi sửa bug: trình bày theo đúng thứ tự — nguyên nhân gây lỗi → cách
   sửa → kết quả → cách test.
3. Khi đề xuất thiết kế/tính năng mới: liệt kê nhiều phương án kèm ưu/nhược
   để tôi tự chọn, không tự chọn sẵn 1 phương án. Cuối cùng nêu phương án
   khuyên dùng kèm lý do.
4. Trước khi báo "xong" một task: tự chạy test (self-review), báo cáo rõ
   đã test những gị, kết quả ra sao. Test phải phản ánh đúng logic nghiệp
   vụ thực tế — không chấp nhận test pass nhưng sai logic.
5. Tiêu chuẩn "xong" một tính năng: hoạt động đúng yêu cầu, hợp lý với
   logic thực tế, test đều pass, không còn lỗi lặt vặt.

## Ràng buộc kiến trúc (không tự ý phá)

- `packages/core` KHÔNG được chứa `console.log`, `process.exit`, hay bất kỳ
  I/O nào gắn với terminal. Core chỉ emit event qua EventEmitter và ghi
  SQLite. `cli` và `server` là consumer, không chứa business logic.
- Event schema và type dùng chung định nghĩa trong `packages/core/src/types.ts`
  (và sau này `packages/shared-types`) — không định nghĩa lại type tương tự
  ở nơi khác.
- Không thêm dependency/tool ngoài roadmap (Turborepo, Docker, auth, v.v.)
  trừ khi tôi yêu cầu — mục "Không làm ở giai đoạn này" trong roadmap là
  ranh giới cứng.

## Code style

- Không yêu cầu style cụ thể. Comment hàm viết bằng tiếng Anh, mô tả rõ
  chức năng.
- Giải thích/trao đổi bằng tiếng Việt; thuật ngữ chuyên ngành giữ tiếng Anh
  kèm nghĩa tiếng Việt.