# Sun* NestJS Conduit (RealWorld) API

> **Dự án thực hành chuyên đề NestJS Framework - Chương trình đào tạo Sun\* Asterisk**  
> **Người thực hiện:** Huỳnh Phước Phú (`cat1454`)  
> **Trainer:** Phạm Thanh Bình

---

## 1. Tổng Quan Dự Án

Hệ thống backend RESTful API xây dựng theo đặc tả **RealWorld (Conduit)** bằng **NestJS Framework (TypeScript)**:
- **Kiến trúc module hóa:** Phân tách rõ Controller, Service, Entity, DTO, Guard và Constants.
- **Tài liệu API:** Swagger / OpenAPI 3.0 tại `/api/docs`.
- **Đa ngôn ngữ (i18n):** `nestjs-i18n` hỗ trợ tiếng Anh (`en`) và tiếng Việt (`vi`) qua query (`?lang=vi`), header (`x-custom-lang`, `Accept-Language`).
- **Chuẩn hóa Request / Response:** Global `ValidationPipe`, `TransformInterceptor` và `HttpExceptionFilter`.
- **Cơ sở dữ liệu & Migration thủ công:** PostgreSQL + TypeORM (`synchronize: false`) với các file migration viết tay cho `users`, `follows`, `attachments`, `articles`, `tags`, `article_tags`, `favorites`.
- **Xác thực & Bảo mật:** JWT (`jti`, `iatMs`), `bcrypt` (giới hạn 72 byte), Redis Blacklist khi logout, thu hồi toàn bộ phiên khi đổi mật khẩu, Rate Limiting (`@nestjs/throttler`), validate biến môi trường lúc khởi động (`validateEnv`).
- **Quản lý tệp đa hình (Polymorphic Attachments):** Upload avatar cục bộ (`/public/uploads/avatars`), xác thực định dạng bằng magic bytes (PNG/JPEG/GIF/WebP), giới hạn 5MB ngay tại Multer và lưu metadata trong bảng `attachments` (`id` UUID, `target_type`, `target_id`).
- **Kiểm thử tự động:** Unit Test (Vitest) và E2E Test (Supertest) chạy trên cơ sở dữ liệu test riêng biệt (`sun_conduit_test`).

---

## 2. Lộ Trình 6 Pull Requests

| Pull Request | Nhánh (Branch) | Trọng Tâm Kỹ Thuật | Trạng Thái |
| :---: | :--- | :--- | :---: |
| **Pull 1** | `feature/pull-1-init-swagger-i18n` | Init NestJS, Swagger UI (`/api/docs`), i18n đa ngôn ngữ, Hello World API | Đã merge (#1) |
| **Pull 2** | `feature/pull-2-manual-migration-and-auth` | Manual DB migrations, Register, Login, Logout (Redis Blacklist), Get Current User | Đã merge (#3) |
| **Pull 3** | `feature/pull-3-user-profiles-and-attachments` | Update User, Polymorphic Avatar Attachments, Get Profile, Follow/Unfollow | Đã merge (#4) |
| **Pull 4** | `feature/pull-4-articles-crud-and-favorites` | CRUD Articles, Filter (`tag`, `author`, `favorited`), Feed, Favorite/Unfavorite, Tags | Đang review (#5) |
| **Pull 5** | `feature/pull-5-comments-and-background-jobs` | Comments, Bull Queue gửi mail với Redis, Scheduler cron jobs | Dự kiến |
| **Pull 6** | `feature/pull-6-e2e-testing-level-c2` | Integration testing, Truncate DB & Fake data, C2 Branch Coverage | Dự kiến |

---

## 3. Cài Đặt & Khởi Chạy

### 3.1. Cài đặt Dependencies
```bash
npm install --legacy-peer-deps
```

### 3.2. Cấu hình Môi trường
Sao chép file cấu hình mẫu `.env.example` thành `.env` và điền đầy đủ thông tin PostgreSQL, Redis, `JWT_SECRET`:
```bash
cp .env.example .env
```

### 3.3. Khởi chạy PostgreSQL & Redis (tùy chọn với Docker Compose)
```bash
docker compose up -d
```

### 3.4. Quản lý Database Migration (Thủ công)
```bash
# Chạy các migration mới trên DB phát triển
npm run migration:run

# Chạy migration trên DB test riêng
NODE_ENV=test npm run migration:run

# Rollback migration gần nhất
npm run migration:revert

# Drop toàn bộ schema và chạy lại từ đầu
npm run migration:reset
```

### 3.5. Khởi chạy Server
```bash
# Chế độ phát triển (Watch mode)
npm run start:dev

# Build & chạy chế độ sản phẩm
npm run build
npm run start:prod
```

Địa chỉ truy cập cục bộ:
- **API Base URL:** `http://localhost:3000/api/v1`
- **Swagger Documentation:** `http://localhost:3000/api/docs`
- **Public Static Files (Avatars):** `http://localhost:3000/public/uploads/avatars/<uuid>.<ext>`

---

## 4. Kiểm Thử & Linting

```bash
# Chạy Unit Tests
npm run test

# Chạy Unit Tests kèm báo cáo độ bao phủ (Coverage)
npm run test:cov

# Chạy E2E Tests (trên database test riêng sun_conduit_test)
npm run test:e2e

# Kiểm tra Linter (Oxlint)
npm run lint

# Định dạng mã nguồn (Prettier)
npm run format
```

---

## 5. Danh Sách API Hiện Có

### Health & i18n
| Method | Endpoint | Auth | Mô tả |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/hello` | Không | Kiểm tra hệ thống và đa ngôn ngữ (`?name=&lang=en\|vi`) |

### Authentication & Users
| Method | Endpoint | Auth | Mô tả |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/v1/users` | Không | Đăng ký tài khoản mới (Rate limited) |
| `POST` | `/api/v1/users/login` | Không | Đăng nhập và nhận JWT token (Rate limited) |
| `POST` | `/api/v1/users/logout` | Bắt buộc | Đăng xuất và đưa `jti` vào Redis blacklist |
| `GET` | `/api/v1/user` | Bắt buộc | Lấy thông tin người dùng hiện tại |
| `PUT` | `/api/v1/user` | Bắt buộc | Cập nhật thông tin user, upload avatar (`multipart/form-data`, trường `avatar`), đổi mật khẩu thu hồi toàn bộ phiên cũ |

### Profiles & Follows
| Method | Endpoint | Auth | Mô tả |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/profiles/:username` | Tùy chọn | Xem hồ sơ công khai kèm trạng thái `following` |
| `POST` | `/api/v1/profiles/:username/follow` | Bắt buộc | Theo dõi người dùng |
| `DELETE` | `/api/v1/profiles/:username/follow` | Bắt buộc | Bỏ theo dõi người dùng |

### Articles, Feed, Favorites & Tags
| Method | Endpoint | Auth | Mô tả |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/articles` | Tùy chọn | Danh sách bài viết (lọc `tag`, `author`, `favorited`, phân trang `limit`/`offset`) |
| `GET` | `/api/v1/articles/feed` | Bắt buộc | Bảng tin từ các tác giả đang theo dõi (`limit`, `offset`) |
| `GET` | `/api/v1/articles/:slug` | Tùy chọn | Xem chi tiết bài viết theo `slug` |
| `POST` | `/api/v1/articles` | Bắt buộc | Tạo bài viết mới (tự động sinh slug duy nhất và gắn `tagList`) |
| `PUT` | `/api/v1/articles/:slug` | Bắt buộc (Tác giả) | Cập nhật bài viết (đổi tiêu đề sẽ cập nhật `slug` mới) |
| `DELETE` | `/api/v1/articles/:slug` | Bắt buộc (Tác giả) | Xóa bài viết |
| `POST` | `/api/v1/articles/:slug/favorite` | Bắt buộc | Yêu thích bài viết |
| `DELETE` | `/api/v1/articles/:slug/favorite` | Bắt buộc | Bỏ yêu thích bài viết |
| `GET` | `/api/v1/tags` | Không | Lấy danh sách toàn bộ tags |
