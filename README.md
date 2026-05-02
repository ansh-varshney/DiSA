# CampusPlay — Sports Court Management System

A sports facility management web application for IIITD, built with **Next.js 16**, **PostgreSQL + Drizzle ORM**, **Auth.js v5**, and **Tailwind CSS / shadcn/ui**.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [User Roles](#user-roles)
- [Getting Started](#getting-started)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Key Features](#key-features)
- [Points & Ban System](#points--ban-system)
- [Supported Sports](#supported-sports)

---

## Overview

CampusPlay manages court bookings, equipment issuance, session approvals, and post-session reporting for a college sports facility. It has three portals — **Student**, **Manager**, and **Admin** — each with role-gated access enforced at both the Next.js middleware and Supabase RLS layers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL (self-hosted) via Drizzle ORM + `postgres` driver |
| Auth | Auth.js v5 (NextAuth) — Google OAuth (students) + Credentials stub (staff) |
| Storage | Local disk served statically (`public/uploads/`) |
| Testing | Vitest + React Testing Library |

---

## Project Structure

```
CampusPlay/
├── design_brief.md          # Full feature specification
├── README.md
├── docs/
│   ├── design_brief.md          # Full feature specification and schema reference
│   └── workflow_assessment.md   # Manual testing checklist (all workflows)
└── web/                         # Next.js application
    ├── src/
    │   ├── auth.ts              # NextAuth config
    │   ├── middleware.ts        # Route protection
    │   ├── db/                  # Drizzle schema + connection
    │   ├── actions/             # Server Actions (data layer)
    │   ├── app/                 # Next.js App Router pages + API routes
    │   ├── components/          # React components
    │   └── lib/                 # Utilities (auth-guards, session, storage, upload)
    ├── drizzle/                 # Drizzle migrations
    ├── supabase_premigration/   # Archive: pre-migration Supabase files (not used)
    └── web/README.md            # Detailed setup and development guide
```

---

## User Roles

| Role | Login Method | Portal |
|---|---|---|
| **Student** | Google OAuth (`@iiitd.ac.in` only) | `/student` |
| **Manager** | Credentials (DB-provisioned account) | `/manager` |
| **Admin / Superuser** | Credentials (DB-provisioned account) | `/admin` |

Role is stored in `profiles.role` (enum: `student`, `manager`, `admin`, `superuser`). Middleware redirects users to their correct portal on every request.

---

## Getting Started

```bash
# 1. Clone the repo
git clone <repo-url>
cd CampusPlay/web

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in: DATABASE_URL, AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET

# 4. Apply Drizzle migrations
npm run db:migrate

# 5. Apply stored procedures (once)
# Run web/src/db/stored-procedures.sql in your Postgres client

# 6. Start dev server
npm run dev
```

App runs at `http://localhost:3000`.

---

## Database Setup

Schema is managed with **Drizzle ORM**:

1. `npm run db:migrate` — applies pending migrations from `web/drizzle/`
2. Apply `web/src/db/stored-procedures.sql` once to register PL/pgSQL functions:
   - `reset_monthly_points()` — monthly reset + top-5 priority booking awards
   - `clear_student_defaulter(id)` — wipes violations + lifts ban

> Point updates (`applyPoints`) and the late-arrival ban check are implemented as inline Drizzle queries using `sql` templates — they do not require stored procedures.

> The `web/supabase_premigration/sql/` directory contains the original Supabase schema and patch files for historical reference. They are not used in the current stack.

---

## Environment Variables

Create `web/.env.local`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/disa
AUTH_SECRET=<openssl rand -base64 32>
AUTH_GOOGLE_ID=<google-cloud-oauth-client-id>
AUTH_GOOGLE_SECRET=<google-cloud-oauth-client-secret>
```

Google OAuth setup:
- Redirect URI: `http://localhost:3000/api/auth/callback/google`
- Only `@iiitd.ac.in` accounts are permitted (enforced in the `signIn` callback)

---

## CI/CD Pipeline

GitHub Actions runs on every push / pull request to `main`:

| Step | Command | Notes |
|---|---|---|
| Format | `npm run format:check` | Prettier — fails on any unformatted file |
| Lint | `npm run lint` | ESLint — all rules are `warn`, not `error` |
| Type-check (app) | `npm run type-check` | `tsconfig.json`, excludes tests |
| Type-check (tests) | `npm run type-check:test` | `tsconfig.test.json` |
| Tests + coverage | `npm run test:coverage` | Thresholds: lines/functions ≥ 70 %, branches ≥ 60 % |
| Build | `npm run build` | Runs only after quality + test jobs pass |

Coverage reports are uploaded as a GitHub Actions artifact (retained 14 days).

---

## Running Tests

```bash
cd web
npm test              # all tests
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

~390 tests across unit, component, API, integration, and concurrency suites.

---

## Key Features

### Student Portal
- **Book courts** — sport/date/time/duration (30/60/90 min), player invites, equipment selection
- **Play requests** — accept/decline invitations via real-time toast (8 s poll)
- **My Reservations** — upcoming, active session (emergency alert button), past bookings
- **Cancel/Withdraw** — cancel own booking (−3 pts if < 3 hrs) or withdraw as a player
- **Leaderboard** — monthly top 5 earn a priority 90-min booking slot
- **Profile** — stats, violation history, feedback submission

### Manager Portal
- **Approvals dashboard** — all bookings in next 24 h window
- **Approve** → `active`; **Reject with reason** → violation + point deduction; 3 late arrivals = 14-day ban
- **Equipment tracking** — set per-item condition during session end
- **Report lost equipment** — marks lost, deducts −20 pts from all players, alerts admins
- **10-min lazy expiry** — unapproved bookings auto-cancel after 10 min

### Admin Portal
- Equipment & court CRUD with image upload
- Reservations calendar with force-cancel, maintenance blocks, priority reserves
- Defaulter students — view violations, clear (wipes + lifts ban)
- Announcements with auto-broadcast to all students
- Coordinators management
- **Analytics**: Financials · Student Welfare · Team Performance

---

## Points & Ban System

| Event | Δ Points |
|---|---|
| Session completed (all good) | +10 |
| Session completed (no equipment) | +8 |
| Session completed (minor damage) | +7 |
| Late cancellation (< 3 hrs) | −3 |
| Booking timeout | −8 |
| Rejection: students late | −6 |
| Rejection: improper gear | −4 |
| Rejection: inappropriate behaviour | −8 |
| Post-session: vandalism | −15 |
| Equipment lost | −20 |

**Monthly reset**: top 5 students earn a priority 90-min booking slot.  
**14-day ban**: triggered after 3 `students_late` violations.  
**Account suspension**: 3+ total violations → blocked from booking.

---

## Supported Sports

Badminton · Tennis · Table Tennis · Squash · Cricket · Football · Volleyball · Basketball · Pool · Snooker
