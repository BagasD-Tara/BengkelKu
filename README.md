# BengkelKu

**BengkelKu** adalah aplikasi manajemen operasional bengkel berbasis mobile untuk membantu bengkel kecil hingga menengah mengelola persediaan suku cadang, pencatatan barang masuk, penyesuaian stok, transaksi penjualan kasir, serta memantau ringkasan dashboard dan laporan operasional harian.

Aplikasi ini dirancang untuk menggantikan pencatatan manual (buku catatan atau spreadsheet) agar stok fisik selalu sinkron dengan sistem, transaksi tercatat secara konsisten dan atomik, serta riwayat operasional mudah ditelusuri dengan pembatasan hak akses berbasis peran (**Owner** dan **Kasir**).

---

## Arsitektur

Project ini menggunakan arsitektur **Monorepo (Turborepo + npm workspaces)** yang terbagi menjadi beberapa workspace:

```text
BengkelKu/
├── apps/
│   ├── api/        # Backend REST API (NestJS + Prisma + PostgreSQL)
│   └── mobile/     # Aplikasi Mobile Android (React Native + Expo)
└── packages/
    ├── shared/             # Tipe, enum, dan konstanta bersama
    └── typescript-config/  # Konfigurasi TypeScript bersama
```

### Backend (`apps/api`)
- **Gaya Arsitektur**: **Modular Monolith** berbasis **NestJS (TypeScript)** dengan pola berlapis per domain (`Controller` → `Service` → `PrismaService`).
- **Database & ORM**: **PostgreSQL (Supabase)** menggunakan **Prisma ORM**:
  - `DATABASE_URL`: Transaction Pooler Supabase (port `6543`) untuk koneksi runtime aplikasi.
  - `DIRECT_URL`: Direct Connection Supabase (port `5432`) untuk migrasi Prisma.
  - Dilengkapi constraint SQL tambahan (`CHECK` constraint, sequence nomor transaksi, dan Row Level Security) di `apps/api/prisma/sql/constraints_and_rls.sql`.
- **Autentikasi & Otorisasi**: **JWT** (`@nestjs/jwt`, `passport-jwt`) dengan global `JwtAuthGuard` dan `RolesGuard` (`@Public()`, `@Roles()`, `@CurrentUser()`), serta hashing password menggunakan `bcryptjs`.
- **Validasi & Standarisasi API**:
  - Global route prefix `/api` dan dokumentasi **Swagger** di `/docs`.
  - `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`).
  - `ResponseInterceptor` global untuk membungkus respons sukses (`{ data }` / `{ data, meta }`).
  - `AllExceptionsFilter` global untuk format error seragam (`{ message, code }`) dan pemetaan error Prisma.
  - Perhitungan batas hari laporan dan dashboard menggunakan zona waktu **WIB (UTC+7)**.

### Mobile (`apps/mobile`)
- Dibangun dengan **React Native + Expo (~52.0)**, `@tanstack/react-query`, dan `expo-secure-store` (saat ini masih berupa kerangka awal).

---

## Daftar Endpoint

Base URL lokal: `http://localhost:3000/api`  
Dokumentasi interaktif Swagger: `http://localhost:3000/docs`

Kecuali endpoint bertanda **Public**, seluruh endpoint membutuhkan header `Authorization: Bearer <access_token>`.

| Modul | Method | Endpoint | Akses | Keterangan |
| :--- | :--- | :--- | :--- | :--- |
| **Health** | `GET` | `/api/health` | Public | Cek status aplikasi dan koneksi database |
| **Auth** | `POST` | `/api/auth/login` | Public | Login pengguna (Owner / Kasir) |
| **Auth** | `GET` | `/api/auth/me` | Owner & Kasir | Ambil profil pengguna yang sedang login |
| **Users** | `GET` | `/api/users` | Owner | Daftar akun pegawai |
| **Users** | `POST` | `/api/users` | Owner | Buat akun Kasir baru |
| **Users** | `PATCH` | `/api/users/:id` | Owner | Ubah data atau nonaktifkan pegawai |
| **Categories** | `GET` | `/api/categories` | Owner & Kasir | Daftar kategori barang |
| **Categories** | `POST` | `/api/categories` | Owner | Tambah kategori baru |
| **Categories** | `PATCH` | `/api/categories/:id` | Owner | Ubah kategori |
| **Categories** | `DELETE` | `/api/categories/:id` | Owner | Hapus kategori (ditolak jika masih dipakai produk) |
| **Products** | `GET` | `/api/products` | Owner & Kasir | Daftar barang (pencarian, filter, paginasi) |
| **Products** | `GET` | `/api/products/low-stock` | Owner & Kasir | Daftar barang dengan stok menipis atau habis |
| **Products** | `GET` | `/api/products/:id` | Owner & Kasir | Detail barang |
| **Products** | `POST` | `/api/products` | Owner | Tambah barang baru |
| **Products** | `PATCH` | `/api/products/:id` | Owner | Ubah atau nonaktifkan barang |
| **Stock** | `POST` | `/api/stock-in` | Owner & Kasir | Catat barang masuk |
| **Stock** | `GET` | `/api/stock-movements` | Owner & Kasir | Riwayat pergerakan stok |
| **Stock** | `POST` | `/api/stock-adjustments` | Owner | Penyesuaian stok bercatatan |
| **Transactions** | `POST` | `/api/transactions` | Owner & Kasir | Buat transaksi penjualan baru (atomik & idempotent, wajib header `Idempotency-Key`) |
| **Transactions** | `GET` | `/api/transactions` | Owner & Kasir | Riwayat transaksi dengan filter |
| **Transactions** | `GET` | `/api/transactions/:id` | Owner & Kasir | Detail transaksi |
| **Transactions** | `POST` | `/api/transactions/:id/cancel` | Owner | Batalkan transaksi dan kembalikan stok |
| **Dashboard** | `GET` | `/api/dashboard` | Owner & Kasir | Ringkasan dashboard hari ini (WIB) |
| **Reports** | `GET` | `/api/reports/sales` | Owner | Laporan penjualan berdasarkan rentang tanggal |
| **Reports** | `GET` | `/api/reports/top-products` | Owner | Laporan barang terlaris |
| **Reports** | `GET` | `/api/reports/stock` | Owner | Laporan pergerakan stok |

---

## Apa Saja yang Sudah Dikerjakan

- **Setup Monorepo**: Konfigurasi Turborepo (`turbo.json`), npm workspaces (`apps/*`, `packages/*`), `packages/typescript-config`, dan `packages/shared`.
- **Skema & Migrasi Database**:
  - Definisi model Prisma (`User`, `Category`, `Product`, `Transaction`, `TransactionItem`, `StockMovement`) beserta enum (`Role`, `TransactionStatus`, `PaymentMethod`, `MovementType`) di `apps/api/prisma/schema.prisma`.
  - Migrasi awal `20261121031624_init` serta skrip SQL `constraints_and_rls.sql`.
- **Infrastruktur & Keamanan Backend**:
  - Bootstrap NestJS (`apps/api/src/main.ts`) dengan prefix `/api`, CORS, Swagger `/docs`, `ValidationPipe`, `AllExceptionsFilter`, dan `ResponseInterceptor`.
  - Guard global `JwtAuthGuard` dan `RolesGuard`, strategi JWT (`jwt.strategy.ts`), decorator (`@Public`, `@Roles`, `@CurrentUser`), dan utilitas tanggal WIB (`date-wib.util.ts`).
- **Implementasi Seluruh Modul Domain Backend**:
  - 9 modul (`health`, `auth`, `users`, `categories`, `products`, `stock`, `transactions`, `dashboard`, `reports`) beserta controller, service, dan DTO validasinya.
- **Unit Test**:
  - File spec pengujian untuk `auth.service`, `categories.service`, `products.service`, `transactions.service`, `all-exceptions.filter`, dan `response.interceptor`.
- **Kerangka Aplikasi Mobile**:
  - Setup awal proyek Expo / React Native di `apps/mobile` (`App.tsx`, `package.json`, `.env.example`). Pengembangan UI dan integrasi API mobile masih dalam tahap selanjutnya.

---

## Cara Clone & Menjalankan Project

### Prasyarat
- **Node.js** (versi LTS) dan **npm**
- **Git**
- Database **PostgreSQL** (misalnya project di **Supabase**)

### 1. Clone Repository & Install Dependensi
```bash
git clone <url-repository-github-anda>
cd BengkelKu
npm install
```

### 2. Konfigurasi Environment
Salin file `.env.example` pada backend dan sesuaikan nilainya (kredensial PostgreSQL/Supabase dan `JWT_SECRET`):
```bash
cp apps/api/.env.example apps/api/.env
```
Isi variabel di `apps/api/.env`:
- `DATABASE_URL`: Connection string Transaction Pooler Supabase (port `6543`)
- `DIRECT_URL`: Connection string Direct Connection Supabase (port `5432`)
- `JWT_SECRET`: Secret key acak yang aman
- `JWT_EXPIRES_IN`: Masa berlaku token (contoh `7d`)
- `PORT`: Port server API (default `3000`)

Jika ingin menjalankan aplikasi mobile nantinya, salin juga environment mobile:
```bash
cp apps/mobile/.env.example apps/mobile/.env
```

### 3. Setup Database (Prisma)
Masuk ke direktori `apps/api`, lalu generate Prisma Client dan terapkan migrasi ke database:
```bash
cd apps/api
npx prisma generate
npx prisma migrate deploy
```
> Setelah migrasi berhasil, jalankan isi file `apps/api/prisma/sql/constraints_and_rls.sql` melalui SQL Editor Supabase untuk mengaktifkan `CHECK` constraint, sequence nomor transaksi, dan Row Level Security (RLS).

Kembali ke root folder:
```bash
cd ../..
```

### 4. Menjalankan Project
Jalankan seluruh workspace dalam mode development menggunakan Turborepo:
```bash
npm run dev
```
Atau jalankan hanya backend API:
```bash
npm run dev --workspace=@bengkelku/api
```

Setelah berjalan:
- API dapat diakses di `http://localhost:3000/api`
- Dokumentasi Swagger tersedia di `http://localhost:3000/docs`

### Perintah Tambahan
```bash
npm run build                          # Build seluruh workspace
npm run typecheck                      # Cek tipe TypeScript seluruh workspace
npm test --workspace=@bengkelku/api    # Jalankan unit test backend
```

