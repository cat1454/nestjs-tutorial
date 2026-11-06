## 📝 Pull Request Summary

### 1. What
- [x] Khởi tạo dự án **NestJS** với TypeScript và cấu trúc module hóa chuẩn mực.
- [x] Tích hợp **Swagger UI** (`@nestjs/swagger`) tương tác trực quan tại `/api/docs`.
- [x] Cấu hình hệ thống **Đa ngôn ngữ (i18n)** (`nestjs-i18n`) với từ điển tiếng Anh (`en`) và tiếng Việt (`vi`), tự động phân giải qua query param (`?lang=vi`), header (`Accept-Language: vi`), hoặc fallback `en`.
- [x] Xây dựng endpoint mẫu **Hello World** (`GET /api/v1/hello`) kiểm tra sức khỏe hệ thống và chào mừng theo đa ngôn ngữ.
- [x] Chuẩn hóa hệ thống với **Global ValidationPipe**, **TransformInterceptor** (Response Envelope) và **HttpExceptionFilter**.
- [x] Viết bộ kiểm thử tự động: Unit Test (`hello.controller.spec.ts`) và E2E Test (`app.e2e-spec.ts`).

---

### 2. Why
- Hoàn thành giai đoạn **Pull Request 1** theo đề bài và hướng dẫn của Trainer Phạm Thanh Bình (Sun\*).
- Thiết lập nền tảng kiến trúc phần mềm, quy chuẩn mã nguồn và tài liệu hóa API phục vụ cho việc mở rộng các module tiếp theo (Authentication, Users, Articles, Comments).

---

### 3. How
- **Framework:** NestJS 12, Node.js v22.
- **Tài liệu API:** `@nestjs/swagger`, `swagger-ui-express`.
- **Đa ngôn ngữ:** `nestjs-i18n` với `I18nJsonLoader`, `QueryResolver`, `HeaderResolver`, `AcceptLanguageResolver`.
- **Validation & Transformation:** `class-validator`, `class-transformer`.
- **Testing:** `vitest`, `supertest`.

---

### 4. Evidence / Verification
- **Unit Test:** `npm run test` -> Passed (3/3 tests)
- **E2E Test:** `npm run test:e2e` -> Passed (3/3 tests)
- **Linter:** `npm run lint` -> Passed (0 errors, 0 warnings)
- **API Test (cURL / PowerShell):**
  - `GET /api/v1/hello` -> `{"statusCode": 200, "message": "Hello, Sunner!...", "data": {...}}`
  - `GET /api/v1/hello?lang=vi&name=Binh` -> `{"statusCode": 200, "message": "Xin chào Binh!...", "data": {...}}`
  - `GET /api/docs` -> 200 OK (Giao diện Swagger UI hiển thị đầy đủ endpoint và schema)

---

### 5. Self-Review Checklist
- [x] Mã nguồn tuân thủ convention và không có cảnh báo từ linter.
- [x] Đã cấu hình `.gitignore` đầy đủ (loại bỏ `node_modules`, `dist`, `.env`).
- [x] Toàn bộ test case đã vượt qua (Green).
- [x] Sẵn sàng gửi GitHub Copilot review.
