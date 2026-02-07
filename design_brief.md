# Sports Court Management App - Design Brief

## Overview
A sports facility management application for the college with three distinct user roles.

## Core Roles
- **Student**: Can book courts.
- **Manager**: Approves equipment issuance.
- **Admin**: Manages data.

## Visual Reference: Home Page
### Design Observations
- **Title**: "Sports Court Management"
- **Subtitle**: "College Sports Facility Portal"
- **Logo**: Shield icon with a checkmark. Dark teal background for the icon.
- **Color Palette**: Dark Teal (Primary), White (Background).
- **Layout**: Centered card/container on a light grey background.
- **Navigation**: Three distinct entry points (buttons) for each role.

---

## Student Workflow
*Verified from 13 total wireframes.*

### 1. Authentication Flow
- **Step 1: Google Sign-In**
  - Button: "Sign in with Google".
  - Branding: App Logo present.
- **Step 2: Phone Verification**
  - Input: Phone Number.
  - Action: "Send OTP".
  - Input: Enter OTP.
  - Action: "Verify".
  - Transition: Goes to Student Home.

### 2. Student Home
- **Header**: "Welcome, Student".
- **Navigation Grid/List**:
  - Book Courts -> [Flow Below]
  - My Reservations -> [Flow Below]
  - Stats / Profile -> Student Profile.
  - Announcements -> Announcements Screen.
  - Leaderboard -> Leaderboard Screen.
  - Events -> (Placeholder).
  - Support & Feedback -> (Placeholder).

### 3. Book Courts Flow
- **Sport Selection**: Dropdown to select available sports.
- **View Options**:
  - [See Reservations]: Opens Calendar View.
  - [Book Court]: Opens Booking Form.

#### Calendar View ('See Reservations')
- **Scope**: Today + Next 3 Days (4 days total).
- **Slots**: 30-minute intervals (e.g., 9:00 - 9:30).
- **States**:
  - [AVAILABLE]: White/Clear.
  - [BOOKED]: Greyed out. Shows equipment used and player count.

#### Booking Form
- **Time Slot**: Dropdown. Max 2 consecutive slots allowed.
- **Waitlist**: "Join Queue" checkbox (only enabled if slot is unavailable).
- **Equipment**: Dropdown (includes 'None').
- **Player Selection**:
  - Search & Add players via dropdown.
  - Validates min/max players per sport.
  - Selected players persists for future.
  - Auto-adds to friends list.
- **Actions**: [Confirm Reservation] or [Cancel].

### 4. Booking Confirmation Flow
- **Stage 1: Pending Player Confirmation**:
  - Status: "Waiting for all players to accept...".
  - List: Shows status for each player (Confirmed vs Pending).
  - Action: [Cancel Booking].
- **Stage 2: Booking Confirmed**:
  - Trigger: All players accepted.
  - Success Message: "All Players Confirmed! Booking is now active".
  - Action: [View in My Reservations].

### 5. My Reservations & Active Session
#### My Reservations Screen
- **Sections**:
  - Current Booking: Highlighted top card. Tap -> Current Booking Flow.
  - Upcoming Bookings: List (Court, Date, Time).
  - Past Bookings: History list.

#### Current Booking / Active Session Flow
- **Step 1: Current Booking Details**:
  - Summary of court/time/equipment/players.
  - Action: [Start Play] or [Cancel Booking].
- **Step 2: Waiting for Manager Approval**:
  - Display: Countdown showing time remaining before slot starts (e.g., "05:00 minutes to start").
  - Status: "Waiting for manager approval...".
  - Action: [Cancel].
- **Step 3: Active Session**:
  - Large Timer (Remaining time, e.g., 24:33).
  - Emergency Button: "⚠️ EMERGENCY - Sends alert to manager".
- **Step 4: Session End (Student View)**:
  - Summary: Duration, Court.
  - Equipment List: Shows status (e.g., "[Returned]").
  - Note: Manager controls equipment return status.
  - Action: [End Session] -> Home.

### 6. Student Profile
- **Header**: "Student Profile".
- **Special Feature**: "ELIGIBLE FOR 3 CONSECUTIVE BOOKINGS" badge (indicated by a star).
- **Details**: Name, Roll Number, Branch, Phone.
- **Play Statistics**: Total Sessions, Student Points, Sports Played breakdown.
- **Friends**: List of friends. Option to [Remove] or [+ Add Friend].
- **Warnings & Complaints**: Read-only history.

### 7. Leaderboard
- **Context**: Monthly leaderboard.
- **List**: Top 5 Students with Points.
- **Personal Rank**: Shows user's specific rank and points.
- **Reward System**: Top 5 get one-time eligibility for 3 consecutive sessions. Resets monthly.

### 8. Announcements
- **Source**: Admin Managed (Not college mail). Admin can add/edit announcements.
- **Content**: Maintenance notices, Equipment updates, Tournament registrations.

### 9. Rules & Penalties (System Logic)
- **Equipment Loss**: Resets points of ALL involved students to 0. Admin notified.
- **Damage**: Progressive point reduction based on severity.
- **Booking Violations**: Late cancellation, No-show, Late session end -> Point reduction.
- **Ban Policy**: 3 violations -> 14-day ban for ALL involved students.
- **ID Card**: Physical ID card submission to manager is MANDATORY at session start (App does not replace this).

---

## Manager Workflow
*Verified from 6 total wireframes.*

### 1. Authentication
- **Method**: Phone Number ONLY (No Google Sign-in).
- **Flow**: Phone Input -> OTP Input -> Home.

### 2. Manager Home (Dashboard)
- **Scope**: Shows ONLY current/active bookings (No past/future).
- **List Items**: Court, Student Name, Time Slot, Status (e.g., "Waiting for approval", "In progress").
- **Action**: Tap item -> Open Approval Screen.

### 3. Manager Approval
- **Input**: Review Student + Session Details.
- **Actions**:
  - [Accept Play] -> Starts Active Session.
  - [Report Student(s)] -> Opens Report Screen.
  - [Reject / Cancel] -> Cancels booking.

### 4. Active Session Management
- **Overview**: Court Info + Remaining Time countdown.
- **Student Management**:
  - List of students.
  - Call option for each student.
  - (Note: Rate Students button is removed from this screen).
- **Equipment Management**:
  - List of specific items (e.g., "Basketball #12").
  - Condition Selectors: [GOOD], [MINOR], [DAMAGED] (Mutually exclusive toggles).
- **Status**: "Equipment Lost" button -> Notifies Admin immediately.
- **End Session**: [End Session] button.

### 5. Report Student
- **Access**: From Approval or Reject screens.
- **Form**:
  - Student Info (ReadOnly).
  - Reason (Checkboxes): Late arrival, Misbehavior, Equipment misuse, Violation of rules, Other.
  - Details (Text Area).
- **Submit**: Updates Student Profile (Warnings) and notifies Admin.

### 6. Rate Students
- **Context**: Mandatory step after ending a session.
- **Input**: List of involved students -> 1-5 Star Rating selection for EACH.
- **Logic**: Ratings impact student points calculation.
- **Action**: [Submit Ratings] -> Proceeds to End Session / Home.

---

## Admin Workflow
*Verified from 14 total wireframes.*

### 1. Authentication
- **Method**: Phone Number ONLY (No Google Sign-in). Same as manager.

### 2. Admin Home (Dashboard Hub)
- **Structure**: Central hub linking to Analytics Dashboards + Core Management.
- **Global Filter**: "Select Sport".
- **Core Modules**:
  - Equipment Management.
  - Court Management.
  - Reservation Viewing.
  - Defaulter Students.
  - Announcements & Notifications (NEW): Add/Edit announcements.
  - Feedback & Complaints (NEW): View student complaints list.
  - Coordinator Info (NEW): View Coach/Team details.

### 3. Core Management Modules
- **Defaulter Students**: List of flagged students, reason, source (Manager/System), and report history.
- **Equipment Management**: Track condition (Good/Minor/Damaged), usage count, vendor info, cost, and lifespan.
- **Reservation Viewing**: 3-day view with power to Force Cancel or Priority Reserve.
- **Court Management**:
  - List: Condition (Excellent/Good/Needs Maintenance), Usage count.
  - Detail: Last used, Last maintenance, Capacity, Notes (e.g., "Floor resurfaced").
  - Actions: Add, Edit, Remove Court.

### 4. Advanced Analytics Dashboards
#### Financials Dashboard
- **Filters**: Vendor.
- **Metrics**: Avg Equipment Lifespan, Cost per Sport, Total Equipment count.
- **Charts**: Equipment Lifespan Chart, Cost Breakdown per Sport.

#### Student Welfare Dashboard
- **Hub**: Top Stats (Successful Bookings, Participation %). Links to 3 sub-views.
  1. **Participation Stats**:
     - Filters: Time Period, Parameter (Branch/Year/Sport).
     - Charts: Bar Graph (Participation), Gender Split (Male/Female %).
     - Action: [Branch Profile Drill-Down].
  2. **Branch Profile Drill-Down**:
     - Filters: Branch (Correctly selected), Parameter (X-axis), Sports/Year, Time Period.
     - Charts: Dual Bar Graph (Male/Female) for Successful Sessions.
  3. **Sport Profile (Heatmap)**:
     - Filters: Sport, Gender, Branch, Year (ALL Required).
     - Viz: Google Calendar style grid. Darker color = More play.
  4. **Student Leaderboard**:
     - Filter: Duration.
     - View: Full list of all students (not just top 5).

#### Team Performance Dashboard
- **Filters**: Sport, Date Range (Start/End).
- **Stats**: Tournaments Played, Wins/Losses, Trophies, Practice Sessions.
- **Visualization**: Win/Loss Chart.
