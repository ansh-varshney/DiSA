# DiSA — Web Application

Next.js 16 application for the DiSA sports court management system. See the [root README](../README.md) for project overview.

---

## Tech Stack

| Layer     | Technology                                              |
| --------- | ------------------------------------------------------- |
| Framework | Next.js 16 (App Router, React Server Components)        |
| Language  | TypeScript                                              |
| Styling   | Tailwind CSS v4 + shadcn/ui                             |
| Database  | PostgreSQL via Drizzle ORM + `postgres` driver          |
| Auth      | Auth.js v5 (NextAuth) — Google OAuth + Credentials stub |
| Storage   | Local disk (`public/uploads/`) served statically        |
| Testing   | Vitest + React Testing Library                          |

---

## Project Structure

```
web/
├── drizzle/                    # Drizzle migration SQL files + metadata snapshots
├── src/
│   ├── auth.ts                 # NextAuth configuration (Google OAuth, JWT strategy)
│   ├── middleware.ts           # Route protection via NextAuth session
│   ├── db/
│   │   ├── index.ts            # Drizzle instance (postgres connection)
│   │   ├── schema.ts           # All table + enum definitions
│   │   └── stored-procedures.sql  # PL/pgSQL functions (apply once to Postgres)
│   ├── actions/                # Next.js Server Actions (all data mutations)
│   │   ├── admin.ts            # Admin CRUD + announcements + defaulter management
│   │   ├── analytics.ts        # Analytics dashboard data (admin-only)
│   │   ├── auth.ts             # signOut wrapper
│   │   ├── bookings.ts         # Booking create/cancel/withdraw + session lifecycle
│   │   ├── courts.ts           # Court read/create
│   │   ├── manager.ts          # Approval, session end, equipment condition
│   │   ├── notifications.ts    # Send/receive notifications + play requests
│   │   └── profile.ts          # Student profile update
│   ├── app/
│   │   ├── (auth)/login/       # Login page (Google OAuth)
│   │   ├── admin/              # Admin portal (equipment, courts, reservations, analytics)
│   │   ├── manager/            # Manager portal (approvals, active sessions)
│   │   ├── student/            # Student portal (booking, reservations, profile, leaderboard)
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/  # NextAuth route handlers
│   │   │   ├── notifications/       # GET polling endpoint (8 s interval)
│   │   │   └── upload/              # POST image upload endpoint
│   │   ├── complete-profile/   # First-login profile completion
│   │   └── dashboard/          # Role-based redirect hub
│   ├── components/             # Shared React components + shadcn/ui primitives
│   └── lib/
│       ├── auth-guards.ts      # requireAdmin() / requireManager() server-action guards
│       ├── session.ts          # getCurrentUser() — reads NextAuth session
│       ├── storage.ts          # Local disk upload/delete (public/uploads/)
│       ├── upload.ts           # validateImageFile() + equipment image helpers
│       ├── sport-config.ts     # Player limits per sport
│       └── sports.ts           # ID generation helpers
├── public/
│   └── uploads/                # User-uploaded images (gitignored except .gitkeep)
├── supabase_premigration/      # Archive: pre-migration Supabase clients, types, SQL
├── drizzle.config.ts
├── vitest.config.ts
└── package.json
```

---

## User Roles

| Role                  | Login                         | Portal     |
| --------------------- | ----------------------------- | ---------- |
| **Student**           | Google OAuth (`@iiitd.ac.in`) | `/student` |
| **Manager**           | Credentials (manual DB entry) | `/manager` |
| **Admin / Superuser** | Credentials (manual DB entry) | `/admin`   |

Role is stored in `profiles.role`. Middleware redirects users to their correct portal on every request.

---

## Getting Started

```bash
# 1. Install dependencies
cd web
npm install

# 2. Set up environment variables
cp .env.example .env.local
# Fill in: DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET

# 3. Run Drizzle migrations
npm run db:migrate

# 4. Apply stored procedures (once)
# Run web/src/db/stored-procedures.sql against your Postgres instance

# 5. Start development server
npm run dev
```

App runs at `http://localhost:3000`.

---

## Environment Variables

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/disa

# NextAuth — generate secret with: openssl rand -base64 32
AUTH_SECRET=your-secret

# Google OAuth (from Google Cloud Console)
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

Google OAuth redirect URI: `http://localhost:3000/api/auth/callback/google`  
Domain restriction: only `@iiitd.ac.in` accounts are allowed through.

---

## Database Management

```bash
npm run db:generate   # generate new migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:push       # push schema directly (dev only)
npm run db:studio     # open Drizzle Studio (visual DB browser)
```

Migrations live in `drizzle/`. Schema is defined in `src/db/schema.ts`.

---

## Running Tests

```bash
npm test              # run all tests (vitest)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
npm run test:ui       # Vitest UI
```

Test files live in `src/__tests__/`:

| Directory      | Contents                                            |
| -------------- | --------------------------------------------------- |
| `actions/`     | Unit tests for all server actions                   |
| `components/`  | Component tests (notification popup, play requests) |
| `integration/` | Booking flow end-to-end                             |
| `concurrency/` | Concurrent operation stress tests                   |
| `lib/`         | Utility tests (upload validation, sport config)     |

---

## Key Features

### Student Portal

- Book courts (30/60/90-min slots, 06:00–22:00)
- Invite players via play requests (accept/decline toast)
- My Reservations — upcoming, active session with emergency alert, past
- Cancel (−3 pts if < 3 hrs) / withdraw from a booking
- Monthly leaderboard; top 5 earn a 90-min priority slot
- Notification feed polled every 8 seconds

### Manager Portal

- Approval dashboard (next 24 h window)
- Approve → `active`; Reject with reason → violation + point deduction
- Equipment condition tracking per item during session end
- Report lost equipment (−20 pts all players, admin alert)
- 10-minute lazy expiry for unapproved bookings

### Admin Portal

- Equipment & court CRUD with image upload
- Reservations calendar with force-cancel and maintenance blocks
- Defaulter students — view violations, clear (wipes violations + lifts ban)
- Announcements — auto-broadcast to all students
- Feedback & complaints (including emergency alerts)
- Coordinators management
- Analytics: Financials · Student Welfare · Team Performance

---

## Points & Ban System

| Event                                 | Δ Points |
| ------------------------------------- | -------- |
| Session completed (all good)          | +10      |
| Session completed (no equipment)      | +8       |
| Session completed (minor damage)      | +7       |
| Session completed (equipment damaged) | 0        |
| Late cancellation (< 3 hrs)           | −3       |
| Booking timeout                       | −8       |
| Rejection: students late              | −6       |
| Rejection: improper gear              | −4       |
| Rejection: inappropriate behaviour    | −8       |
| Post-session: late end                | −4       |
| Post-session: vandalism               | −15      |
| Equipment lost                        | −20      |

**Monthly reset**: triggered on first leaderboard visit of the month. Top 5 get `priority_booking_remaining = 1`.  
**14-day ban**: after 3 `students_late` violations.  
**Account suspension**: 3+ total violations → blocked from booking until admin clears.

---

## Supported Sports

Badminton · Tennis · Table Tennis · Squash · Cricket · Football · Volleyball · Basketball · Pool · Snooker
