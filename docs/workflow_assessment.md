# DiSA — Manual Testing Workflow Assessment

---

### WORKFLOW 1 — Student Authentication

**1a. Email Sign-Up (new student)**
- [ ] Navigate to `/login?role=student`, switch to Email tab, toggle to Sign Up
- [ ] Fill in Full Name, Branch, Year, Gender, Email, Password → Submit
- [ ] Account created, redirected to `/complete-profile` (if profile incomplete) or `/student`
- [ ] Supabase `profiles` table has a new row with `role = student`

**1b. Email Sign-In (existing student)**
- [ ] Sign in with email + password → lands on `/student`
- [ ] Wrong password shows error message, does not redirect

**1c. Google OAuth (student)**
- [ ] Click Google button → Google OAuth flow → redirected back → lands on `/student`
- [ ] Profile row exists in `profiles`

**1d. Phone + OTP (student)**
- [ ] Switch to Phone tab, enter `+91` number → Send OTP → receive SMS
- [ ] Enter 6-digit OTP → Verify → lands on `/student`

**1e. Manager login**
- [ ] Navigate to `/login?role=manager` → Email/Password → lands on `/manager`

**1f. Admin login**
- [ ] Navigate to `/login?role=admin` → Email/Password → lands on `/admin`

**1g. Role redirect guard**
- [ ] Student tries to access `/admin` → redirected away
- [ ] Unauthenticated user accessing `/student/book` → redirected to login

---

### WORKFLOW 2 — Profile Completion (First Login)

- [ ] New Google/phone sign-in user redirected to `/complete-profile`
- [ ] Form has Branch, Year, Gender fields (required)
- [ ] Submit → profile updated → redirected to `/student`
- [ ] Revisiting `/complete-profile` after completion → redirected to `/student`

---

### WORKFLOW 3 — Student Booking (Core Flow)

**3a. Browse courts**
- [ ] Go to `/student/book`
- [ ] Select a sport → courts appear
- [ ] Select today's date → time grid renders (06:00–22:00, 30-min slots)
- [ ] Past time slots are greyed/faded (not tappable)
- [ ] Booked slots show booker name + player count
- [ ] Available slots are tappable

**3b. Create a booking (30 min)**
- [ ] Tap an available slot → booking dialog opens
- [ ] Select duration 30 min
- [ ] Search for a player (min 2 chars) → results appear (banned students are excluded)
- [ ] Add player → player added to list
- [ ] Select equipment (if available for that sport/time window)
- [ ] Confirm → success message
- [ ] Slot now shows as booked in the grid
- [ ] Invited player receives a play request notification

**3c. Booking validation — past slot**
- [ ] Try to book a slot in the past (pick yesterday) → error "Cannot book a slot in the past"

**3d. Booking validation — overlap**
- [ ] Attempt to book same court + same slot again → error "Time slot is already booked"

**3e. Booking validation — student double-book**
- [ ] Same student tries to book a different court at an overlapping time → error "You already have a booking during this time"

**3f. Booking validation — player limits**
- [ ] For Table Tennis, try to add 5 players (max 4) → error shown
- [ ] For Badminton with 1 player → error "Minimum 2 players"

**3g. 60-min booking**
- [ ] Select 60-min duration → booking created spanning 2 slots

**3h. 90-min priority booking**
- [ ] Student WITHOUT priority slot → 90-min option absent or blocked
- [ ] Student WITH `priority_booking_remaining = 1` → 90-min selectable → booking created → `priority_booking_remaining` set to 0 → student gets `priority_booking_used` notification

**3i. Banned student cannot book**
- [ ] Student with active `banned_until` → error showing ban expiry date

**3j. Suspended student cannot book**
- [ ] Student with ≥ 3 violations → error "account suspended"

---

### WORKFLOW 4 — Play Request Flow

**4a. Accept play request**
- [ ] Invited student goes to `/student/play-requests`
- [ ] Pending request visible with sport, court, time, inviter name
- [ ] Click Accept → status changes to "Accepted"
- [ ] Booker receives `play_request_accepted` notification
- [ ] Booking's `players_list` for this player now shows `status: confirmed`

**4b. Reject play request (booking survives)**
- [ ] Invited student rejects → status "Declined"
- [ ] Booker notified (`play_request_rejected`)
- [ ] Booking remains active (player count still above minimum)

**4c. Reject play request → booking cancelled (below min players)**
- [ ] Set up a booking with exactly min players; one player rejects
- [ ] Booking auto-cancelled (status → `cancelled`)
- [ ] Booker + other confirmed players get `play_request_booking_cancelled` notification
- [ ] Equipment freed (`is_available = true`)

---

### WORKFLOW 5 — Student Starts Play → Manager Approves

**5a. Student taps Start Play**
- [ ] Go to `/student/reservations`, find a `confirmed` booking
- [ ] Click "Start Play" → booking status → `waiting_manager`
- [ ] All managers receive `student_ready_to_play` notification

**5b. Manager sees the booking**
- [ ] Manager refreshes `/manager/approvals`
- [ ] Booking appears with status "Waiting for approval"

**5c. Manager approves**
- [ ] Manager taps booking → Booking Detail
- [ ] Click Accept → booking status → `active`
- [ ] All confirmed players receive `booking_session_active` notification ("Report to Court")

**5d. Active session visible to student**
- [ ] Student's `/student/reservations` shows booking in Active Session section
- [ ] Countdown timer running

---

### WORKFLOW 6 — Normal Session End

**After WORKFLOW 5 (session is active):**

**6a. Manager sets equipment conditions**
- [ ] Manager on booking detail sees each equipment item
- [ ] Toggles condition: Good / Minor Damage / Damaged (mutually exclusive per item)

**6b. Manager ends session**
- [ ] Click "End Session"
- [ ] Booking status → `completed`
- [ ] Equipment freed (`is_available = true`) and `total_usage_count` incremented
- [ ] Points awarded to all players:
  - All good: +10 pts each
  - Minor damage: +7 pts each
  - Damaged: +0 pts each
- [ ] All players get `session_ended` notification with points earned

**6c. Student profile updated**
- [ ] Student profile shows incremented `points` and completed session count

---

### WORKFLOW 7 — Manager Rejects Booking

**7a. Reject: Students Late**
- [ ] Manager at booking detail → Reject → select "Students Late" → confirm
- [ ] Booking → `cancelled`, equipment freed
- [ ] Each student gets −6 points
- [ ] Each student gets `booking_rejected` notification
- [ ] Violation record (`students_late`) created per student in `student_violations`

**7b. After 3rd late rejection → 14-day ban**
- [ ] Same student gets `students_late` violation 3 times total
- [ ] On 3rd: `banned_until = now + 14 days` set on profile
- [ ] Student gets `ban_applied` notification
- [ ] Student's profile shows ban status + expiry date
- [ ] Student cannot create new bookings (error shown)

**7c. Reject: Improper Gear (−4 pts)**
- [ ] Select "Improper Gear" → students get −4 pts

**7d. Reject: Inappropriate Behaviour (−8 pts)**
- [ ] Select "Inappropriate Behaviour" → students get −8 pts

**7e. Reject: Other (0 pts)**
- [ ] Select "Other", enter custom reason → students get 0 pts but violation logged

---

### WORKFLOW 8 — Booking Auto-Expiry (10-min Timeout)

- [ ] Create a booking for a slot starting now (or in the past)
- [ ] Student taps Start Play (booking → `waiting_manager`)
- [ ] Wait 10+ minutes without manager approval
- [ ] Manager loads the booking detail → lazy expiry triggers
- [ ] Booking auto-cancelled, equipment freed
- [ ] All players get −8 pts
- [ ] `booking_timeout` violation logged per student
- [ ] Players get `booking_expired` notification

---

### WORKFLOW 9 — Student Cancels Booking

**9a. Cancel more than 3 hours before start**
- [ ] Find an upcoming `confirmed` booking
- [ ] Click Cancel → booking → `cancelled`, equipment freed
- [ ] No point deduction
- [ ] Confirmed players notified (`booking_cancelled_by_booker`)

**9b. Cancel within 3 hours of start**
- [ ] Cancel a booking starting in < 3 hours
- [ ] Booking cancelled, equipment freed
- [ ] Booker loses −3 points

**9c. Player withdraws (booking survives)**
- [ ] Non-booker player goes to `/student/reservations`
- [ ] Clicks Withdraw → removed from `players_list`
- [ ] Player count still above minimum → booking survives
- [ ] Booker gets `player_withdrew` notification

**9d. Player withdraws → booking auto-cancelled (below min)**
- [ ] Player withdraws when count would drop below sport minimum
- [ ] Booking auto-cancelled, equipment freed
- [ ] All remaining confirmed players notified (`booking_auto_cancelled`)

---

### WORKFLOW 10 — Student Emergency Alert

- [ ] During an active session, student goes to `/student/reservations`
- [ ] In the active session card, clicks "Emergency Alert"
- [ ] Enter reason → submit
- [ ] `feedback_complaints` entry created (category: `emergency_by_student`)
- [ ] All managers + admins receive `student_emergency_alert` notification
- [ ] Entry visible in admin `/admin/feedback` page

---

### WORKFLOW 11 — Manager Emergency End Session

- [ ] Manager on an active booking → clicks "Emergency End Session"
- [ ] Enter reason → confirm
- [ ] Booking → `completed`, equipment freed
- [ ] `feedback_complaints` entry created (category: `emergency_by_manager`)
- [ ] All students get `session_ended_emergency` notification
- [ ] All admins get `emergency_alert` notification
- [ ] Visible in `/admin/feedback`

---

### WORKFLOW 12 — Equipment Lost

- [ ] Manager on active booking detail → click "Report Lost Equipment"
- [ ] Select which equipment items are lost → confirm
- [ ] Selected equipment: `condition = 'lost'`, `is_available = false`
- [ ] Lost equipment removed from any future bookings (those bookings not cancelled)
- [ ] All players in this booking get `lost_equipment` (severe) violation
- [ ] Each player loses −20 pts
- [ ] Players receive `equipment_lost` notification
- [ ] All admins receive `equipment_incident` notification
- [ ] Equipment no longer appears as available for new bookings
- [ ] Admin `/admin/defaulters` shows the players

---

### WORKFLOW 13 — Post-Session Student Report

- [ ] After ending a session, manager on the (now completed) booking
- [ ] Click "Report Student" for a specific player
- [ ] Select reason: Late End (−4), Inappropriate Behaviour (−8), Vandalism (−15), Other (0)
- [ ] Optionally add custom reason text → submit
- [ ] Violation logged for that student
- [ ] Student's points updated
- [ ] Student receives `violation_issued` notification
- [ ] Student appears in `/admin/defaulters`

---

### WORKFLOW 14 — Admin Clears Defaulter

- [ ] Go to `/admin/defaulters`
- [ ] Find a student with violations
- [ ] Click Clear → `clear_student_defaulter()` runs
- [ ] All violations for that student deleted
- [ ] `banned_until` set to null
- [ ] Student removed from defaulters list
- [ ] Student can now book again

---

### WORKFLOW 15 — Monthly Leaderboard & Priority Booking

**15a. Monthly reset**
- [ ] New calendar month begins
- [ ] First student visits `/student/leaderboard`
- [ ] `reset_monthly_points()` runs → all students' points set to 0
- [ ] Top-5 students get `priority_booking_remaining = 1`
- [ ] Top-5 get `priority_booking_awarded` notification ("Eligible for 90-min booking")

**15b. Priority booking used**
- [ ] Top-5 student goes to book courts
- [ ] 90-min option is visible (others cannot see it)
- [ ] Books a 90-min slot → success
- [ ] `priority_booking_remaining` → 0
- [ ] Student gets `priority_booking_used` notification
- [ ] 90-min option no longer available for that student

**15c. Leaderboard view**
- [ ] Top 5 shown with gold/silver/bronze medals
- [ ] "Eligible for 3 consecutive bookings" badge shown on top-5 rows
- [ ] User's own rank highlighted if outside top 5

---

### WORKFLOW 16 — Admin Equipment Management

- [ ] Go to `/admin/equipment`
- [ ] Create equipment: fill name, sport, condition, vendor, cost, purchase date, notes, upload image → save
- [ ] Equipment appears in list with auto-generated ID (e.g., `BD-001`)
- [ ] Edit equipment → change condition → save → list updates
- [ ] Delete equipment → removed from list
- [ ] Filter by sport → only that sport's equipment shown
- [ ] Equipment with `condition = lost` does NOT appear in student booking equipment picker

---

### WORKFLOW 17 — Admin Court Management

- [ ] Go to `/admin/courts`
- [ ] Create court: name, sport, type, capacity, condition, maintenance notes → save
- [ ] Court appears in list with auto-generated ID
- [ ] Edit court → update condition to "needs_maintenance" → save
- [ ] Toggle court inactive → court no longer appears in student booking UI
- [ ] Delete court → removed

---

### WORKFLOW 18 — Admin Reservations & Force Cancel

- [ ] Go to `/admin/reservations`
- [ ] Select sport → select date → calendar grid renders all courts × slots
- [ ] Booked slots show booking details
- [ ] **Force Cancel**: click a booking → cancel → booking status `cancelled`, equipment freed, players notified
- [ ] **Create Maintenance Booking**: block a slot → booking with `is_maintenance = true` created → slot greyed out in student booking UI
- [ ] **Priority Reserve**: create a booking with `is_priority = true`

---

### WORKFLOW 19 — Admin Announcements

- [ ] Go to `/admin/announcements`
- [ ] Create announcement: title + content → save
- [ ] Announcement saved and visible
- [ ] All students receive a broadcast notification (`announcement_created`)
- [ ] Students see announcement (via notifications feed)
- [ ] Edit / delete announcement → updates reflect immediately

---

### WORKFLOW 20 — Admin Feedback & Complaints

- [ ] Go to `/admin/feedback`
- [ ] View complaints submitted by students (from profile page)
- [ ] View emergency alerts (from student or manager emergency actions)
- [ ] Filter by category
- [ ] Update status: open → in_progress → resolved
- [ ] Status shown on student's profile page under "My Feedback"

---

### WORKFLOW 21 — Admin Coordinators

- [ ] Go to `/admin/coordinators`
- [ ] Add coordinator: name, role (Coach/Team Captain/etc.), sport, email, phone, notes → save
- [ ] Coordinator appears in list
- [ ] Edit / delete coordinator → updates reflect

---

### WORKFLOW 22 — Notifications (All Roles)

**22a. Real-time popup**
- [ ] Trigger any action that sends a notification (e.g., booking created)
- [ ] Bell icon in nav shows unread count badge
- [ ] Toast popup appears (bottom-right) within 30 seconds
- [ ] Clicking toast marks it read and removes it
- [ ] Dismiss (X) removes toast

**22b. Notification feed (student)**
- [ ] Go to `/student/notifications`
- [ ] All non-play-request notifications listed
- [ ] Click notification → marks read
- [ ] "Mark all read" button clears badge

**22c. Play request notifications**
- [ ] Play request notifications do NOT appear in the main notification feed
- [ ] They appear only on `/student/play-requests`

**22d. Manager notifications**
- [ ] Go to `/manager/notifications` → see all manager-targeted notifications
- [ ] Mark read / mark all read works

**22e. Admin notifications**
- [ ] Go to `/admin/notifications` → see all admin-targeted notifications

---

### WORKFLOW 23 — Maintenance Flashcard

- [ ] Admin creates a maintenance booking for a court today (via reservations page)
- [ ] Student home page (`/student`) shows a maintenance flashcard for that court
- [ ] Manager home page shows the maintenance flashcard
- [ ] After the maintenance slot end time, flashcard disappears

---

### WORKFLOW 24 — Analytics Dashboards (Admin)

**24a. Financials**
- [ ] Go to `/admin/analytics/financials`
- [ ] Vendor filter dropdown shows all unique vendors
- [ ] Metrics: total equipment count, avg lifespan sessions (for damaged/lost), total cost
- [ ] Cost-by-sport bar chart renders (bars scaled to max)
- [ ] Filter by specific vendor → data changes

**24b. Student Welfare Hub**
- [ ] Go to `/admin/analytics/student-welfare`
- [ ] Current month successful bookings count shown
- [ ] Links to Participation Stats, Branch Profile, Student Leaderboard all work

**24c. Participation Stats**
- [ ] Select time period + parameter (Branch/Year/Sport)
- [ ] Bar chart renders with participation counts
- [ ] Gender split shown (male % / female %)

**24d. Branch Profile Drill-Down**
- [ ] Select branch + parameter + time period
- [ ] Dual bars (male vs female) render for successful sessions

**24e. Student Leaderboard (admin)**
- [ ] Duration filter (current month / last 3 months / all time)
- [ ] Full ranked list of all students

**24f. Team Performance**
- [ ] Go to `/admin/analytics/team-performance`
- [ ] Select sport → stats render (practice sessions, tournaments, wins, losses, trophies)
- [ ] Monthly practice chart renders (last 12 months)
- [ ] Date range filter (start/end) narrows the data

---

### WORKFLOW 25 — Student Profile Edit

- [ ] Go to `/student/profile`
- [ ] Click Edit Profile → form opens with current values
- [ ] Update name / phone / student ID / branch / year / gender → save
- [ ] Profile card reflects new values immediately
- [ ] Violations list shows last 2 months only (max 10)
- [ ] Feedbacks/complaints section shows submitted items with status badges
