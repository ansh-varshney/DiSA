# CampusPlay — Sports Court Management System

A sports facility management web application for IIITD, built with **Next.js 15**, **Supabase**, and **Tailwind CSS / shadcn/ui**.

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
| Framework | Next.js 15 (App Router, React Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Backend / DB | Supabase (PostgreSQL + RLS + Storage) |
| Auth | Supabase Auth (Email/Password, Google OAuth, Phone OTP) |
| Testing | Vitest |

---

## Project Structure

```
CampusPlay/
├── design_brief.md          # Full feature specification
├── README.md
└── web/
    ├── database/            # SQL migration files (run in order)
    │   ├── 01_base_schema.sql
    │   ├── 02_admin_schema_extension.sql
    │   ├── 03_points_ban_system.sql
    │   ├── 04_notifications.sql
    │   └── 05_priority_booking.sql
    ├── src/
    │   ├── actions/         # Next.js Server Actions
    │   │   ├── admin.ts
    │   │   ├── analytics.ts
    │   │   ├── auth.ts
    │   │   ├── bookings.ts
    │   │   ├── manager.ts
    │   │   ├── notifications.ts
    │   │   └── profile.ts
    │   ├── app/
    │   │   ├── (auth)/login/      # Shared login page (all roles)
    │   │   ├── admin/             # Admin portal
    │   │   ├── manager/           # Manager portal
    │   │   ├── student/           # Student portal
    │   │   └── complete-profile/  # First-login profile completion
    │   ├── components/      # Shared React components
    │   ├── lib/             # Utilities (sport-config, sports, upload)
    │   └── utils/supabase/  # Supabase client helpers (client, server, admin, middleware)
    └── __tests__/           # Vitest test suites
```

---

## User Roles

| Role | Login Methods | Portal |
|---|---|---|
| **Student** | Email/Password, Google OAuth, Phone+OTP | `/student` |
| **Manager** | Email/Password, Phone+OTP | `/manager` |
| **Admin / Superuser** | Email/Password, Phone+OTP | `/admin` |

Role is stored in `profiles.role` (enum: `student`, `manager`, `admin`, `superuser`). Middleware redirects users to their correct portal after login.

---

## Getting Started

```bash
# 1. Clone the repo
git clone <repo-url>
cd CampusPlay/web

# 2. Install dependencies
npm install

# 3. Set up environment variables (see below)
cp .env.example .env.local

# 4. Run development server
npm run dev
```

App runs at `http://localhost:3000`.

---

## Database Setup

Run migration files **in order** in the Supabase SQL Editor:

```
1. web/database/01_base_schema.sql          — Core tables, enums, RLS
2. web/database/02_admin_schema_extension.sql — violations, feedback, coordinators
3. web/database/03_points_ban_system.sql    — ban columns, points RPCs
4. web/database/04_notifications.sql        — notifications + play_requests tables
5. web/database/05_priority_booking.sql     — priority_booking_remaining, updated RPCs
```

Additional patch files in `web/database/` handle field additions (equipment pictures, court fields, etc.). Apply as needed for your Supabase instance.

### Supabase Storage

Set up two storage buckets:
- `court-images` — for court photos
- `equipment-images` — for equipment photos

Run `web/database/setup_court_storage.sql` and `web/database/setup_equipment_storage.sql` for bucket policies.

---

## Environment Variables

Create `web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service role key is used by `createAdminClient()` for server-side operations that bypass RLS (notification inserts, points updates, ban RPCs).

---

## Running Tests

```bash
cd web
npm test            # run all tests
npm run test:ui     # Vitest UI
npm run coverage    # generate coverage report
```

Test files live in `web/src/__tests__/`:
- `actions/` — unit tests for all server actions
- `components/` — component tests (notification popup, play requests client)
- `integration/` — booking flow end-to-end
- `concurrency/` — concurrent operation tests
- `lib/` — utility tests

---

## Key Features

### Student Portal
- **Book courts** — select sport, date, time slot (06:00–22:00, 30-min grid), duration (30/60/90 min), players, equipment
- **Play requests** — accept/reject invitations from other students
- **My Reservations** — upcoming, active session (with emergency alert), past bookings
- **Cancel/Withdraw** — cancel own booking (−3 pts if < 3 hrs before) or withdraw as a player
- **Leaderboard** — monthly top-5; top students earn a priority 90-min booking slot
- **Profile** — stats, violations history, feedback submission, profile editing
- **Notifications** — real-time toast popups (30s poll) + full notification feed

### Manager Portal
- **Approvals dashboard** — all bookings in next 24h window
- **Approve session** — transitions booking to `active`, notifies players
- **Reject with reason** — issues violation + point deduction; late arrivals trigger 14-day ban at 3rd strike
- **Equipment tracking** — set per-item condition (Good/Minor/Damaged) during session
- **Report lost equipment** — marks equipment lost, deducts −20 pts from all players, alerts admins
- **End session** — awards points based on equipment condition
- **Emergency end** — ends session early, logs to admin feedback
- **Post-session report** — report individual student after session ends
- **Auto-expiry** — bookings not approved within 10 min of start time auto-cancel with −8 pts violation

### Admin Portal
- **Equipment management** — CRUD with images, vendor/cost tracking, condition monitoring
- **Court management** — CRUD with condition, maintenance notes, usage tracking
- **Reservations** — date+sport calendar, force-cancel any booking, create maintenance blocks, priority reserves
- **Defaulter students** — view all violations, clear individual students (wipes violations + lifts ban)
- **Announcements** — create/edit/delete; auto-broadcasts to all students
- **Feedback & complaints** — view all complaints and emergency alerts, update status
- **Coordinators** — manage sport coaches and team captains
- **Analytics**:
  - **Financials** — cost by sport, equipment lifespan, vendor filter
  - **Student Welfare** — participation stats (branch/year/sport), gender split, drill-down, leaderboard
  - **Team Performance** — practice sessions, tournaments, wins/losses by sport + date range

---

## Points & Ban System

| Event | Points |
|---|---|
| Session completed (all equipment good) | +10 |
| Session completed (no equipment) | +8 |
| Session completed (minor damage) | +7 |
| Session completed (equipment damaged) | 0 |
| Late cancellation (< 3 hrs before) | −3 |
| Rejection: students late | −6 |
| Rejection: improper gear | −4 |
| Rejection: inappropriate behaviour | −8 |
| Post-session: late end | −4 |
| Post-session: inappropriate behaviour | −8 |
| Post-session: vandalism | −15 |
| Booking timeout (no-show) | −8 |
| Equipment lost | −20 |

**Monthly reset**: Triggered on first leaderboard visit of each new month. Top 5 students receive a 90-min priority booking slot.

**14-day ban**: Triggered after 3 `students_late` violations. Admin can clear manually.

**Account suspension**: 3 or more total violations → cannot create new bookings until admin clears.

---

## Supported Sports

Badminton · Tennis · Table Tennis · Squash · Cricket · Football · Volleyball · Basketball · Pool · Snooker
