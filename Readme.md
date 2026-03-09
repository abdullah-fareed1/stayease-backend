# StayEase — Hotel Booking API

Backend REST API for **StayEase**, a hotel room booking platform built for Grand Horizon Hotels. Handles everything from authentication and room management to Stripe payments, Cloudinary image uploads, and Firebase push notifications.

Built with Node.js, Express, Prisma ORM, and a Neon PostgreSQL database.

---

## What it does

- JWT auth for both customers and hotel staff (separate token flows, role-based access)
- Room listing with availability checking, image management via Cloudinary
- Booking engine with real-time overlap detection — no double bookings
- Stripe payment processing (partial 50% or full, with webhook handling)
- Shopping cart with batch checkout
- Firebase Cloud Messaging for push notifications to guests
- Admin dashboard with revenue stats, occupancy overview, and best-performing rooms
- Transactional emails via Resend (booking confirmations, receipts, password resets)
- Post-checkout review and rating system

---

## Tech stack

| Layer | Tech |
|---|---|
| Runtime | Node.js v20+ |
| Framework | Express.js |
| Database | PostgreSQL (Neon serverless) |
| ORM | Prisma |
| Auth | JWT — access token 15m, refresh token 7d |
| Payments | Stripe (sandbox) |
| Images | Cloudinary |
| Email | Resend |
| Push notifications | Firebase Admin SDK (FCM) |
| File handling | Multer (memory storage) |
| Security | bcryptjs, helmet, cors, express-rate-limit |

---

## Project structure

```
src/
├── config/          # Prisma client, Cloudinary, Stripe, Firebase init
├── controllers/     # One controller per domain
├── middleware/       # JWT auth guards, role guards, error handler
├── routes/          # Route definitions (customer + admin)
├── services/        # Email, Cloudinary upload/delete, FCM send
├── validations/     # Input validation schemas
├── utils/           # Response helpers, JWT helpers, pagination
├── app.js           # Express setup and middleware registration
└── server.js        # Entry point
prisma/
├── schema.prisma    # Full data model
└── seed.js          # Seeds initial admin account
```

---

## Getting started

**Prerequisites:** Node.js v20+, a [Neon](https://neon.tech) database, Cloudinary account, Stripe account, Resend account, Firebase project.

```bash
git clone https://github.com/yourusername/stayease-backend.git
cd stayease-backend
npm install
```

Copy the example env file and fill in your credentials:

```bash
cp .env.example .env
```

Run the database migration and seed the first admin account:

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

Start the dev server:

```bash
npm run dev
```

The API will be running at `http://localhost:3000`.

---

## Environment variables

```env
DATABASE_URL=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

RESEND_API_KEY=
EMAIL_FROM=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

CLIENT_BASE_URL=
PORT=3000
```

---

## API overview

All responses follow a consistent shape:

```json
{
  "status": true,
  "message": "Rooms fetched successfully",
  "data": { ... }
}
```

`status: false` means something went wrong — the `message` field will say what.

### Auth — customers
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns token pair |
| POST | `/api/auth/refresh` | Get new access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |

### Auth — admin
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/admin/auth/login` | Admin login |
| POST | `/api/admin/auth/refresh` | Refresh token |
| POST | `/api/admin/auth/logout` | Logout |
| POST | `/api/admin/auth/forgot-password` | Send reset email |
| POST | `/api/admin/auth/reset-password` | Reset with token |

### Rooms
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/rooms` | — | List rooms (filterable by category, price, availability) |
| GET | `/api/rooms/:id` | — | Room detail with images and reviews |
| POST | `/api/admin/rooms` | Admin | Create room |
| PUT | `/api/admin/rooms/:id` | Admin | Update room details |
| PATCH | `/api/admin/rooms/:id/availability` | Admin | Toggle availability |
| POST | `/api/admin/rooms/:id/images` | Admin | Upload image (multipart) |
| DELETE | `/api/admin/rooms/:id/images/:imgId` | Admin | Remove image |

### Bookings
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/bookings` | Customer | Create booking |
| GET | `/api/bookings/my` | Customer | My bookings |
| DELETE | `/api/bookings/:id/cancel` | Customer | Cancel booking |
| GET | `/api/admin/bookings` | Admin | All bookings |
| POST | `/api/admin/bookings/walk-in` | Admin | Create walk-in booking |
| PATCH | `/api/admin/bookings/:id/status` | Admin | Update status |

### Cart
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/cart` | Customer | View cart |
| POST | `/api/cart/items` | Customer | Add item |
| DELETE | `/api/cart/items/:id` | Customer | Remove item |
| POST | `/api/cart/checkout` | Customer | Convert cart to bookings |

### Payments
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/payments/initiate` | Customer | Create Stripe PaymentIntent |
| POST | `/api/payments/webhook` | Stripe | Payment confirmation webhook |
| GET | `/api/payments/booking/:id` | Customer/Admin | Payment history |
| POST | `/api/admin/payments/:id/refund` | Admin | Issue refund |

### Other
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/reviews` | Customer | Submit review (post-checkout only) |
| GET | `/api/rooms/:id/reviews` | — | Room reviews |
| POST | `/api/admin/notifications/send` | Admin | Push notification to all or specific user |
| GET | `/api/admin/dashboard/overview` | Admin | Revenue, occupancy, best-performing rooms |
| GET | `/api/hotel/config` | — | Hotel info and coordinates |

---

## Auth design

Two completely separate token flows — customers and admins never share tokens.

Access tokens expire in **15 minutes**. When a request returns 401, the client calls `/auth/refresh` with the refresh token to get a new pair. Refresh tokens are stored as bcrypt hashes in the database, not plain text. Logging out clears the hash server-side so the old token is permanently dead even if intercepted.

Password reset tokens are single-use, expire in 1 hour, and are also stored hashed. The forgot-password endpoint always returns the same response regardless of whether the email exists — no email enumeration.

---

## Payment flow

This API never touches card data. The flow:

1. Client calls `POST /api/payments/initiate` → server creates a Stripe PaymentIntent and returns the `clientSecret`
2. The mobile app passes the `clientSecret` to the Stripe SDK which renders its own card UI
3. Stripe confirms the payment and calls the webhook at `POST /api/payments/webhook`
4. Webhook verifies the Stripe signature, updates the payment record, and fires the confirmation email

Partial payments (50% upfront) are supported. The remaining balance can be paid before check-in.

---

## Image uploads

Images go through the backend before hitting Cloudinary — the Cloudinary API secret never touches the client. Multer buffers the file in memory, the backend validates type (JPEG/PNG/WebP) and size (max 5MB), then streams the buffer directly to Cloudinary. The `secure_url` and `public_id` are stored in the database. Deletion hits both Cloudinary and the database atomically.

---

## Database schema

Key models: `User`, `Admin`, `Room`, `RoomImage`, `Booking`, `Payment`, `Cart`, `CartItem`, `Review`, `Notification`, `HotelConfig`.

Booking availability is checked with an overlap query — any existing booking with status `PENDING`, `CONFIRMED`, or `CHECKED_IN` that overlaps the requested date range blocks the new booking.

---

## Scripts

```bash
npm run dev          # Start with nodemon
npm run start        # Production start
npx prisma studio    # Open Prisma GUI
npx prisma db seed   # Seed admin account
```

---

## Testing the Stripe webhook locally

Install the Stripe CLI and run:

```bash
stripe listen --forward-to localhost:3000/api/payments/webhook
```

Use test card `4242 4242 4242 4242` with any future expiry and any CVC.

---

## Security

- Passwords hashed with bcrypt (cost factor 12)
- JWT secrets are separate for access and refresh tokens
- Rate limiting on all auth routes (10 req / 15 min per IP)
- `helmet` sets secure HTTP headers on every response
- Input sanitisation on all endpoints — emails normalised, strings trimmed, enums validated
- Prisma parameterised queries — no raw SQL injection surface
- `.env` is gitignored — a `.env.example` with empty values is provided instead

---

## License

Public — MIT license.