# NestJS Conduit (RealWorld) API Tutorial

Dự án thực hành xây dựng RESTful API theo đặc tả RealWorld (Conduit) sử dụng NestJS Framework.

---

## 1. Tổng Quan Dự Án

- **NestJS Framework (TypeScript)** với kiến trúc module hóa.
- **Tài liệu hóa API:** Swagger / OpenAPI 3.0 tại `/api/docs`.
- **Đa ngôn ngữ (i18n):** `nestjs-i18n` hỗ trợ Tiếng Anh (`en`) và Tiếng Việt (`vi`).
- **Validation & Response:** DTO validation với `class-validator`, Response envelope với `TransformInterceptor`, xử lý lỗi tập trung với `HttpExceptionFilter`.
- **Quản lý CSDL:** Migration thủ công (TypeORM / PostgreSQL).
- **Xác thực bảo mật:** JWT Authentication & Redis Blacklist Token khi Logout.

---

## 2. Lộ Trình Pull Requests

| Pull Request | Nhánh (Branch) | Nội Dung | Trạng Thái |
| :---: | :--- | :--- | :---: |
| **Pull 1** | `feature/pull-1-init-swagger-i18n` | Init NestJS, Swagger UI (`/api/docs`), i18n đa ngôn ngữ, Hello World API | Đã merge |
| **Pull 2** | `feature/pull-2-manual-migration-and-auth` | Manual DB migrations, Register, Login, Logout (Redis Blacklist), Current User | Hoàn thành |
| **Pull 3** | `feature/pull-3-user-profile-and-attachments` | Update User, Profile, Follow/Unfollow, Polymorphic Avatar Attachment | Dự kiến |
| **Pull 4** | `feature/pull-4-articles-crud-and-favorites` | CRUD Articles, Filter, Feed, Favorite, Slug generation | Dự kiến |
| **Pull 5** | `feature/pull-5-comments-and-background-jobs` | Comments, Bull Queue gửi mail với Redis, Scheduler cron jobs | Dự kiến |
| **Pull 6** | `feature/pull-6-e2e-testing-level-c2` | Integration testing, Truncate DB & Fake data, C2 Branch Coverage | Dự kiến |

---

## 3. Cài Đặt & Khởi Chạy

### 3.1. Cài đặt Dependencies
```bash
npm install --legacy-peer-deps
```

### 3.2. Cấu hình Môi trường
Sao chép file cấu hình mẫu `.env.example` thành `.env`:
```bash
cp .env.example .env
```

### 3.3. Chạy Database Migration
```bash
npm run migration:run
```

### 3.4. Khởi chạy Server
```bash
# Chế độ phát triển (Watch mode)
npm run start:dev

# Chế độ sản phẩm (Build & Run)
npm run build
npm run start:prod
```

- **API Base URL:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`

---

## 4. Kiểm Thử & Linting

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
