# DiSA — Sports Court Management System
## Design Brief (Updated from Codebase)

---

## Overview

DiSA is a sports facility management web application for IIITD. It has three distinct user roles (Student, Manager, Admin/Superuser) built on **Next.js 16 (App Router)** with **PostgreSQL + Drizzle ORM** for the database, **Auth.js v5 (NextAuth)** for authentication, and local disk storage. The UI uses **Tailwind CSS v4 + shadcn/ui** components.

**App color**: Dark Teal `#004d40`  
**Home URL**: `/` — three role entry points (Student, Manager, Admin).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, React Server Components) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL (self-hosted) via Drizzle ORM + `postgres` driver |
| Auth | Auth.js v5 (NextAuth) — Google OAuth (students) + Credentials stub (staff) |
| Storage | Local disk (`public/uploads/`) served statically by Next.js |
| Testing | Vitest + React Testing Library |
| Deployment | Vercel / self-hosted |

---

## Database Schema Summary

### Core Tables
- **profiles** — standalone user table (not linked to Supabase auth); fields: `email`, `full_name`, `role` (student/manager/admin/superuser), `phone_number`, `student_id`, `branch`, `gender`, `year`, `points`, `is_eligible_for_consecutive`, `banned_until`, `last_points_reset`, `priority_booking_remaining`, `password_hash` (nullable, for Credentials login), `avatar_url`
- **courts** — `name`, `sport`, `type`, `capacity`, `is_active`, `condition` (excellent/good/needs_maintenance), `maintenance_notes`, `usage_count`, `last_maintenance_date`
- **equipment** — `name`, `sport`, `condition` (good/minor_damage/damaged/lost), `is_available`, `total_usage_count`, `vendor_name`, `cost`, `purchase_date`, `expected_lifespan_days`, `pictures`, `notes`, `equipment_id`
- **bookings** — `user_id`, `court_id`, `start_time`, `end_time`, `status` (pending_confirmation → confirmed → waiting_manager → active → completed | cancelled | rejected), `players_list` (JSONB with id/status/name/branch/gender/year), `equipment_ids`, `num_players`, `is_maintenance`, `is_priority`
- **announcements** — `title`, `content`, `created_by`
- **student_violations** — `student_id`, `violation_type`, `severity`, `reason`, `reported_by`, `points_deducted`, `booking_id`
- **feedback_complaints** — `student_id`, `booking_id`, `title`, `description`, `category` (emergency_by_student, emergency_by_manager, general), `status` (open/in_progress/resolved)
- **coordinators** — `name`, `role`, `sport`, `email`, `phone`, `notes`
- **notifications** — `recipient_id`, `sender_id`, `type`, `title`, `body`, `data` (JSONB), `is_read`
- **play_requests** — `booking_id`, `requester_id`, `recipient_id`, `status` (pending/accepted/rejected/expired), `notification_id`

### Key Database RPCs
- `update_student_points(p_student_id, p_delta)` — atomic point update
- `reset_monthly_points()` — resets all student points, awards `priority_booking_remaining = 1` to top 5; returns `{reset_count, top5_ids}`
- `check_and_apply_late_ban(p_student_id)` — if ≥ 3 `students_late` violations → 14-day ban; returns `banned_until` timestamp or null
- `clear_student_defaulter(p_student_id)` — wipes all violations + lifts ban

---

## User Roles

| Role | Auth Methods | Access |
|---|---|---|
| **Student** | Google OAuth (`@iiitd.ac.in`) | Booking, reservations, profile, leaderboard, notifications, play requests |
| **Manager** | Credentials (DB-provisioned) | Approval dashboard, active session management, reports |
| **Admin / Superuser** | Credentials (DB-provisioned) | Full system management + analytics |

---

## Student Workflow

### 1. Authentication

**Methods:**
- **Students** — Google OAuth (`@iiitd.ac.in` domain only). On first sign-in, a `profiles` row is upserted automatically.
- **Managers / Admins** — Credentials login (email + password hashed with bcrypt). Accounts must be provisioned in the DB directly.

All roles share the same login page (`/login`). Auth is handled by Auth.js v5 (NextAuth) with a JWT session strategy. The session exposes `session.user.id` (our profile UUID) and `session.user.role`.

After first Google sign-in, if profile is incomplete (missing branch/year/gender), the student is redirected to `/complete-profile`.

### 2. Student Home (`/student`)

- Welcome card with student name
- Navigation grid:
  - **Book Courts** → `/student/book`
  - **My Reservations** → `/student/reservations`
  - **Leaderboard** → `/student/leaderboard`
  - **My Profile** → `/student/profile`
  - **Notifications** → `/student/notifications`
  - **Play Requests** → `/student/play-requests`
- Maintenance flashcard (if any courts are under maintenance today)
- Notification popup (polls `GET /api/notifications` every 8 s for new unread notifications; shows toast overlays)

### 3. Book Courts (`/student/book`)

#### Court & Date Selection
- Select **sport** (dropdown derived from active courts)
- Select **date** (today → +6 days)
- Calendar grid shows all courts × time slots (06:00–22:00, 30-min intervals)
- Slot states: **Available** (tappable), **Booked** (greyed, shows booker name + player count), **Past** (faded)

#### Booking Dialog (on slot tap)
- **Duration**: 30 min / 60 min / 90 min (90 min only if `priority_booking_remaining > 0`)
- **Add Players**: search by name (min 2 chars), add to list. Validates sport-specific min/max player limits:
  - Badminton, Tennis: 2–6
  - Table Tennis, Squash: 2–4
  - Cricket, Football, Volleyball, Basketball, Pool, Snooker: 2–∞
- **Equipment**: multi-select from available (non-lost, non-in-use) equipment for that sport and time window
- **Confirm** → creates booking in status `confirmed`

#### Booking Validation (server-side)
- Cannot book in the past
- Check `banned_until` (14-day ban blocks new bookings)
- Check `student_violations` count ≥ 3 → account suspended, cannot book
- 90-min requires `priority_booking_remaining > 0`; consumes it on success
- Overlap check: same court, same time → rejected
- Student double-booking check: same student, any court, overlapping time → rejected
- Equipment optimistic lock: if another booking grabs equipment concurrently → roll back

#### After Booking Creation
- Invited players receive a **play request** notification
- Managers receive a **new_booking** notification
- If 90-min priority used: student gets `priority_booking_used` notification and `priority_booking_remaining` set to 0

### 4. Play Requests (`/student/play-requests`)

- Lists all pending play requests (invitations from other students)
- Each card shows: sport, court, date/time, inviter name
- **Accept** → marks player as `confirmed` in booking's `players_list`; notifies booker (N2)
- **Reject** → removes player from `players_list`; notifies booker (N3). If player count drops below sport minimum → booking auto-cancelled and all confirmed players notified (N4)
- Accepted/rejected requests shown with status badges

### 5. My Reservations (`/student/reservations`)

**Sections:**
- **Active Session** — current booking with `active` status in real-time window
- **Upcoming** — bookings with status `pending_confirmation`, `confirmed`, `waiting_manager` and `end_time` in future
- **Past** — `completed`, `cancelled`, `rejected` bookings

**Actions per booking:**
- `confirmed` → **"Start Play"** button → transitions to `waiting_manager`, notifies all managers (N student_ready_to_play)
- `confirmed`/`waiting_manager` → **"Cancel Booking"** → frees equipment, deducts −3 pts if within 3 hours of start; notifies confirmed players (N8)
- Invited player (non-booker) → **"Withdraw"** → removes from `players_list`; if drops below minimum → auto-cancel (N auto_cancelled)
- `active` → **"Emergency Alert"** button → creates `feedback_complaints` entry with category `emergency_by_student`, notifies all managers + admins (N emergency)

### 6. Active Session (Student Side)
- Shows during `active` status in the current booking window
- Countdown timer (remaining time)
- Emergency Alert button with reason input
- Session shows court, sport, time, equipment list, player list

### 7. Student Profile (`/student/profile`)

**Displays:**
- Name, branch, year, gender, student ID, email
- Points (current month), total completed sessions
- Ban status (if `banned_until` is in future) + ban expiry date
- Suspension status (if `student_violations` count ≥ 3)
- Late-arrival strike count (from violations in last 2 months)
- Priority booking remaining slot (`priority_booking_remaining`)
- Recent violations (last 2 months, max 10)
- Submitted feedbacks/complaints (max 20) with status (open/in_progress/resolved)

**Actions:**
- Edit profile (name, phone, student ID, branch, year, gender via `ProfileEditForm`)
- Submit Feedback/Complaint (title, description, category via `FeedbackForm`)

### 8. Leaderboard (`/student/leaderboard`)

- Triggers `reset_monthly_points()` RPC (idempotent; no-op if already reset this month)
- If a new month reset runs → notifies top-5 students of `priority_booking_awarded`
- Shows top 5 students by points (gold/silver/bronze medals)
- Shows current user's rank if not in top 5
- Top 5 earn "eligible for 3 consecutive bookings" badge (visual only; actual eligibility tracked by `priority_booking_remaining`)

### 9. Notifications (`/student/notifications`)

- Full notification feed (excludes `play_request_received` type — those are on Play Requests page)
- Mark individual or all notifications as read
- Notification popup (bell icon in nav) polls every 30s for new notifications; shows animated toasts

---

## Manager Workflow

### 1. Authentication
- Same login page (`/login?role=manager`)
- Email/Password or Phone+OTP (no Google OAuth required, but the form supports it)

### 2. Manager Home / Approvals (`/manager` and `/manager/approvals`)

- Dashboard shows all **active-window bookings** (statuses: `pending_confirmation`, `confirmed`, `waiting_manager`, `active`) within the next 24 hours
- Also shows bookings that ended within the last 1 hour if `active` (to allow late session end)
- Each booking card shows: court, sport, student name, time slot, status badge
- Maintenance flashcard shown for courts under maintenance today
- Tap booking → Booking Detail (`/manager/approvals/[id]`)

### 3. Booking Approval Screen (`/manager/approvals/[id]`)

**Lazy Expiry Check (on page load):**
- If booking is `pending_confirmation` or `waiting_manager` AND `now > start_time + 10 min` → auto-cancel, issue `booking_timeout` violation to all students (−8 pts each), notify students (N7 booking_expired)

**Booking Detail View:**
- Court name, sport, date/time, player list (with roles), equipment list

**Actions:**
- **Accept (Approve)** → `updateBookingStatus(bookingId, 'active')` → notifies all confirmed players to report to court (N5)
- **Reject with Reason** → `rejectWithReason(bookingId, reason, customReason, playerIds)`:
  - Reasons: `students_late` (−6 pts), `inappropriate_behaviour` (−8 pts), `improper_gear` (−4 pts), `other` (0 pts)
  - Issues violation record per student, deducts points
  - If `students_late`: checks ban threshold → if ≥ 3 late violations → 14-day ban + N16
  - Notifies students of rejection (N6)
- **Report Student** (from active session) → `reportStudentPostSession()`:
  - Reasons: `late_end` (−4 pts), `inappropriate_behaviour` (−8 pts), `vandalism` (−15 pts), `other` (0 pts)
  - Issues violation, deducts points, notifies student (N13)

### 4. Active Session Management

**Equipment Condition Tracking:**
- Per-equipment condition selectors: **Good**, **Minor Damage**, **Damaged** (mutually exclusive)
- Report Lost Equipment button → `reportLostEquipment()`:
  - Marks equipment as `condition = 'lost'`, `is_available = false`
  - Removes from future bookings (doesn't cancel them)
  - Issues `lost_equipment` (severe) violation to all players (−20 pts each)
  - Notifies players (N14) and admins (N21)

**Session End:**
- **End Session** → `endSession(bookingId, equipmentConditions)`:
  - Atomically marks booking `completed`
  - Updates equipment condition + frees availability + increments `total_usage_count`
  - Awards points to all confirmed players:
    - Base: +8
    - All equipment good: +2 bonus → total +10
    - Any minor damage: −1 → total +7
    - Any damaged: −8 → total 0
  - Notifies all players of session end + points earned (N10)

- **Emergency End Session** → `emergencyEndSession(bookingId, reason)`:
  - Marks booking `completed`, frees equipment
  - Creates `feedback_complaints` entry (category: `emergency_by_manager`)
  - Notifies players (N11 session_ended_emergency) + admins

### 5. Manager Notifications (`/manager/notifications`)

- Same feed as admin, scoped to the manager's `recipient_id`
- Mark read / mark all read

---

## Admin Workflow

### 1. Authentication
- Same login page (`/login?role=admin`)

### 2. Admin Home (`/admin`)

Hub page linking to all management modules and analytics dashboards.

### 3. Equipment Management (`/admin/equipment`)

- View all equipment (filterable by sport)
- **Create**: name, sport, condition, vendor, cost, purchase date, notes, images (uploaded to Supabase Storage)
- **Edit**: update all fields, swap images
- **Delete**: removes record
- Equipment ID is auto-generated per sport (e.g., `TT-001`)
- Tracks: condition, `is_available`, `total_usage_count`, vendor, cost, `expected_lifespan_days`

### 4. Court Management (`/admin/courts`)

- View all courts with condition, usage count, active status
- **Create**: name, sport, type, capacity, condition, maintenance notes, image
- **Edit**: update all fields
- **Toggle active/inactive**
- Court ID auto-generated per sport

### 5. Reservations Management (`/admin/reservations`)

- Filter by sport + date
- Calendar grid shows all courts × slots with booking details
- **Force Cancel**: admin can cancel any active/confirmed booking (frees equipment, notifies players)
- **Create Maintenance Booking**: admin can block a court slot as maintenance (creates a booking with `is_maintenance = true`)
- **Priority Reserve**: admin can create a booking with `is_priority = true`

### 6. Defaulter Students (`/admin/defaulters`)

- Lists all students with ≥ 1 violation
- Shows latest violation type, ban status, violation count
- Stats: total defaulters, active 14-day bans, lost-equipment cases
- Violation types shown with labels + colors:
  - `lost_equipment`, `inappropriate_behaviour`, `vandalism`, `late_end`, `students_late`, `improper_gear`, `booking_timeout`, `other`
- **Clear Defaulter**: calls `clear_student_defaulter(studentId)` → removes all violations + lifts ban; notifies student

### 7. Announcements (`/admin/announcements`)

- View all announcements
- Create announcement (title + content)
- Edit / delete announcements
- Visible to all students (broadcasted via `broadcastToAllStudents` notification on create)

### 8. Feedback & Complaints (`/admin/feedback`)

- View all student feedback/complaints + emergency alerts
- Filter by category (general, emergency_by_student, emergency_by_manager)
- Update status: open → in_progress → resolved
- Shows booking context if feedback linked to a booking

### 9. Coordinators (`/admin/coordinators`)

- Manage sport coordinators (coaches, team captains)
- Fields: name, role, sport, email, phone, notes
- CRUD operations

### 10. Notifications (`/admin/notifications`)

- Full notification feed for the admin (mark read / mark all read)

### 11. Booking Logs (`/admin/logs`)

- Historical view of all bookings across all courts

---

## Analytics Dashboards

### Financials (`/admin/analytics/financials`)

- Filter by vendor
- **Metrics**: Total equipment count, average lifespan (sessions, for damaged/lost items), total cost
- **Cost by sport**: bar chart scaled to max cost
- **Lifespan by sport**: avg sessions survived for damaged/lost equipment
- **Count by sport**: equipment count per sport

### Student Welfare (`/admin/analytics/student-welfare`)

Hub page showing current-month successful bookings, linking to:

1. **Participation Stats** (`/student-welfare/participation`)
   - Filters: time period, parameter (branch/year/sport), sport
   - Bar charts: participation count by chosen parameter
   - Gender split (male/female %)

2. **Branch Profile Drill-Down** (`/student-welfare/branch-profile`)
   - Filters: branch, parameter (year/sport), time period
   - Dual bar charts (male vs female) for successful sessions

3. **Student Leaderboard** (`/student-welfare/leaderboard`)
   - Filter by duration (current month / last 3 months / all time)
   - Full ranked list of all students by points

### Team Performance (`/admin/analytics/team-performance`)

- Filters: sport, date range (start/end)
- **Stats**: Practice sessions, tournaments, wins, losses, trophies
- Monthly practice chart (bar graph, last 12 months)

---

## Points System

| Event | Delta |
|---|---|
| Session completed, all equipment good | +10 (+8 base +2 bonus) |
| Session completed, no equipment | +8 |
| Session completed, minor damage | +7 (+8 base −1) |
| Session completed, equipment damaged | 0 (+8 base −8) |
| Late cancellation (< 3 hours before) | −3 |
| Rejection: students late | −6 |
| Rejection: inappropriate behaviour | −8 |
| Rejection: improper gear | −4 |
| Rejection: other | 0 |
| Post-session: late end | −4 |
| Post-session: inappropriate behaviour | −8 |
| Post-session: vandalism | −15 |
| Booking timeout (no-show, auto-cancel) | −8 |
| Equipment lost | −20 |

**Monthly reset**: All student points reset to 0 on first leaderboard visit of each new month. Top 5 students get `priority_booking_remaining = 1` (one 90-min priority booking).

---

## Ban & Suspension System

| Condition | Effect |
|---|---|
| `banned_until` set (future) | Cannot create new bookings |
| `student_violations` count ≥ 3 | Account suspended, cannot book |
| 3× `students_late` violations | Triggers 14-day booking ban (`banned_until = now + 14 days`) |

**Admin can clear**: `clear_student_defaulter()` removes all violations and lifts ban.

---

## Notification Triggers Summary

| ID | Event | Recipients |
|---|---|---|
| N1 | Play request sent | Invited player |
| N2 | Play request accepted | Booker |
| N3 | Play request rejected | Booker |
| N4 | Booking cancelled (below min players) | Booker + remaining confirmed players |
| N5 | Session activated by manager | All confirmed players |
| N6 | Booking rejected by manager | All students in booking |
| N7 | Booking auto-expired (10-min timeout) | All students in booking |
| N8 | Booking cancelled by booker | All confirmed players |
| N9 | Player withdrew | Booker |
| N10 | Session ended normally | All confirmed players |
| N11 | Session ended by emergency | All confirmed players |
| N12 | Auto-cancel (player withdrew below min) | Booker + remaining confirmed players |
| N13 | Post-session violation issued | Reported student |
| N14 | Equipment reported lost | All players in booking |
| N15 | Announcement created | All students (broadcast) |
| N16 | 14-day ban applied | Banned student |
| N17 | Priority booking awarded | Top-5 students (monthly) |
| N18 | Priority booking used | Student who used it |
| N19 | New booking created | All managers |
| N20 | Student ready to play | All managers |
| N21 | Equipment reported lost | All admins |
| N22 | Emergency alert (student-triggered) | All managers + admins |
| N23 | Emergency session end (manager) | All admins |
| N24 | Defaulter cleared | Cleared student |

---

## Supported Sports

Badminton, Tennis, Table Tennis, Squash, Cricket, Football, Volleyball, Basketball, Pool, Snooker

---

## Visual Design

- **Primary colour**: Dark Teal `#004d40`
- **Background**: White / light grey
- **Component library**: shadcn/ui (Card, Button, Badge, Dialog, Input, Table)
- **Icons**: Lucide React
- **Layout**: Mobile-first, centered cards, max-w constraints for analytics pages
- **Booking calendar**: CSS grid, 30-min slots, colour-coded by status
