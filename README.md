# Sun* NestJS Conduit (RealWorld) API Tutorial

> **Dự án thực hành chuyên đề NestJS Framework - Chương trình đào tạo Sun\* Asterisk**  
> **Người thực hiện:** Huỳnh Phước Phú (cat1454)  
> **Trainer:** Phạm Thanh Bình  
> **Repository:** `d:/Sun/nestjs-tutorial`

---

## 🚀 1. Tổng Quan Dự Án

Dự án triển khai một hệ thống backend RESTful API chuẩn mực theo đặc tả **RealWorld (Conduit)** với các tính năng:
- **NestJS Framework (TypeScript)** với kiến trúc module hóa sạch sẽ.
- **Tài liệu hóa API tương tác:** Swagger / OpenAPI 3.0 tại `/api/docs`.
- **Hỗ trợ đa ngôn ngữ (i18n):** `nestjs-i18n` hỗ trợ Tiếng Anh (`en`) và Tiếng Việt (`vi`).
- **Chuẩn hóa Request / Response:** DTO validation với `class-validator`, Response envelope với `TransformInterceptor`, xử lý lỗi tập trung với `HttpExceptionFilter`.
- **Quản lý CSDL:** Migration thủ công (Manual TypeORM / PostgreSQL migrations).
- **Xác thực bảo mật:** JWT Authentication & Redis Blacklist Token khi Logout.
- **Đính kèm đa hình (Polymorphic Attachments):** Quản lý upload tệp cục bộ cho avatar và đa phương tiện.
- **Tác vụ ngầm & Lập lịch:** Hàng đợi xử lý gửi email bất đồng bộ (`@nestjs/bull` + Redis) và cron job (`@nestjs/schedule`).
- **Kiểm thử tự động:** Unit test và E2E testing đạt độ bao phủ nhánh C2 (Branch/Decision coverage) với cơ chế truncate DB và fake data tự động.

---

## 📌 2. Lộ Trình 6 Pull Requests

| Pull Request | Nhánh (Branch) | Trọng Tâm Kỹ Thuật | Trạng Thái |
| :---: | :--- | :--- | :---: |
| **Pull 1** | `feature/pull-1-init-swagger-i18n` | Init NestJS, Swagger UI (`/api/docs`), i18n đa ngôn ngữ, Hello World API | ✅ Hoàn thành |
| **Pull 2** | `feature/pull-2-manual-migration-and-auth` | Manual DB migrations, Register, Login, Logout (Redis Blacklist), Current User | ⏳ Chờ review PR 1 |
| **Pull 3** | `feature/pull-3-user-profile-and-attachments` | Update User, Profile, Follow/Unfollow, Polymorphic Avatar Attachment | ⏳ Dự kiến |
| **Pull 4** | `feature/pull-4-articles-crud-and-favorites` | CRUD Articles, Filter, Feed, Favorite, Slug generation | ⏳ Dự kiến |
| **Pull 5** | `feature/pull-5-comments-and-background-jobs` | Comments, Bull Queue gửi mail với Redis, Scheduler cron jobs | ⏳ Dự kiến |
| **Pull 6** | `feature/pull-6-e2e-testing-level-c2` | Integration testing, Truncate DB & Fake data, C2 Branch Coverage | ⏳ Dự kiến |

---

## 🛠️ 3. Cài Đặt & Khởi Chạy

### 3.1. Cài đặt Dependencies
```bash
npm install --legacy-peer-deps
```

### 3.2. Cấu hình Môi trường
Sao chép file cấu hình mẫu `.env.example` thành `.env`:
```bash
cp .env.example .env
```

### 3.3. Khởi chạy Server
```bash
# Chế độ phát triển (Watch mode)
npm run start:dev

# Chế độ sản phẩm (Build & Run)
npm run build
npm run start:prod
```

Server sẽ lắng nghe tại:
- **API Base URL:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`

---

## 🧪 4. Kiểm Thử (Testing) & Kiểm Tra Quy Chuẩn (Linting)

```bash
# Chạy Unit Tests
npm run test

# Chạy E2E Tests
npm run test:e2e

# Kiểm tra Linter
npm run lint

# Định dạng mã nguồn
npm run format
```

---

## 📡 5. Chi Tiết API Pull Request 1 (Hello World & Health Check)

- **Endpoint:** `GET /api/v1/hello`
- **Query Params:**
  - `name` *(string, optional, max: 50)*: Tên người nhận lời chào (mặc định: `Sunner`).
  - `lang` *(string, optional, enum: `en`, `vi`)*: Ngôn ngữ phản hồi (mặc định: `en`).
- **Headers:**
  - `Accept-Language: vi` (hoặc `en`)
  - `x-custom-lang: vi`

### Ví dụ Request & Response:
**Request:**
```http
GET /api/v1/hello?name=Binh&lang=vi HTTP/1.1
Host: localhost:3000
```

**Response (200 OK):**
```json
{
  "statusCode": 200,
  "message": "Xin chào Binh! Chào mừng bạn đến với Sun* NestJS Tutorial API.",
  "data": {
    "greeting": "Xin chào Binh! Chào mừng bạn đến với Sun* NestJS Tutorial API.",
    "healthCheck": "Hệ thống đang hoạt động ổn định và sẵn sàng.",
    "locale": "vi",
    "serverTime": "2026-11-06T08:30:00.000Z"
  },
  "timestamp": "2026-11-06T08:30:00.000Z"
}
```
