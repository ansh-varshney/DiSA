import {
    pgTable,
    pgEnum,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    date,
    decimal,
    jsonb,
} from 'drizzle-orm/pg-core'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', ['student', 'manager', 'admin', 'superuser'])

export const bookingStatusEnum = pgEnum('booking_status', [
    'pending_confirmation',
    'confirmed',
    'waiting_manager',
    'active',
    'completed',
    'cancelled',
    'rejected',
])

export const equipmentConditionEnum = pgEnum('equipment_condition', [
    'good',
    'minor_damage',
    'damaged',
    'lost',
    'retired',
])

export const courtConditionEnum = pgEnum('court_condition', ['good', 'minor_damage', 'damaged'])

export const violationSeverityEnum = pgEnum('violation_severity', ['minor', 'moderate', 'severe'])

export const complaintStatusEnum = pgEnum('complaint_status', ['open', 'in_progress', 'resolved'])

// ─── Profiles ────────────────────────────────────────────────────────────────

export const profiles = pgTable('profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').unique(),
    full_name: text('full_name'),
    role: userRoleEnum('role').default('student'),
    phone_number: text('phone_number'),
    avatar_url: text('avatar_url'),
    student_id: text('student_id'),
    branch: text('branch'),
    points: integer('points').default(0),
    is_eligible_for_consecutive: boolean('is_eligible_for_consecutive').default(false),
    gender: text('gender'),
    year: text('year'),
    banned_until: timestamp('banned_until', { withTimezone: true }),
    last_points_reset: date('last_points_reset'),
    priority_booking_remaining: integer('priority_booking_remaining').default(0),
    // Nullable — only set for admin/manager accounts (Phase 4 step 17/19)
    password_hash: text('password_hash'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Courts ───────────────────────────────────────────────────────────────────

export const courts = pgTable('courts', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sport: text('sport').notNull(),
    type: text('type'),
    capacity: integer('capacity').default(4),
    is_active: boolean('is_active').default(true),
    maintenance_notes: text('maintenance_notes'),
    condition: courtConditionEnum('condition').default('good'),
    last_maintenance_date: date('last_maintenance_date'),
    usage_count: integer('usage_count').default(0),
    pictures: text('pictures').array(),
    notes: text('notes'),
    court_id: text('court_id').unique(),
    next_check_date: date('next_check_date'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Equipment ────────────────────────────────────────────────────────────────

export const equipment = pgTable('equipment', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    sport: text('sport').notNull(),
    condition: equipmentConditionEnum('condition').default('good'),
    is_available: boolean('is_available').default(true),
    total_usage_count: integer('total_usage_count').default(0),
    vendor_name: text('vendor_name'),
    cost: decimal('cost', { precision: 10, scale: 2 }),
    purchase_date: date('purchase_date'),
    expected_lifespan_days: integer('expected_lifespan_days').default(365),
    pictures: text('pictures').array().default([]),
    notes: text('notes').default(''),
    equipment_id: text('equipment_id').unique(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookings = pgTable('bookings', {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id')
        .references(() => profiles.id)
        .notNull(),
    court_id: uuid('court_id')
        .references(() => courts.id)
        .notNull(),
    start_time: timestamp('start_time', { withTimezone: true }).notNull(),
    end_time: timestamp('end_time', { withTimezone: true }).notNull(),
    status: bookingStatusEnum('status').default('pending_confirmation'),
    players_list: jsonb('players_list'),
    equipment_ids: uuid('equipment_ids').array().default([]),
    is_maintenance: boolean('is_maintenance').default(false),
    is_priority: boolean('is_priority').default(false),
    num_players: integer('num_players').default(2),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Announcements ────────────────────────────────────────────────────────────

export const announcements = pgTable('announcements', {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    created_by: uuid('created_by').references(() => profiles.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Student Violations ───────────────────────────────────────────────────────

export const studentViolations = pgTable('student_violations', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    violation_type: text('violation_type').notNull(),
    severity: violationSeverityEnum('severity').default('minor'),
    reason: text('reason').notNull(),
    reported_by: uuid('reported_by').references(() => profiles.id),
    points_deducted: integer('points_deducted').default(0),
    booking_id: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Feedback & Complaints ────────────────────────────────────────────────────

export const feedbackComplaints = pgTable('feedback_complaints', {
    id: uuid('id').primaryKey().defaultRandom(),
    student_id: uuid('student_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: complaintStatusEnum('status').default('open'),
    resolved_by: uuid('resolved_by').references(() => profiles.id, { onDelete: 'set null' }),
    category: text('category').notNull().default('general'),
    booking_id: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
})

// ─── Coordinators ─────────────────────────────────────────────────────────────

export const coordinators = pgTable('coordinators', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    sport: text('sport').notNull(),
    email: text('email'),
    phone: text('phone'),
    notes: text('notes'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    recipient_id: uuid('recipient_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    sender_id: uuid('sender_id').references(() => profiles.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    data: jsonb('data').default({}),
    is_read: boolean('is_read').default(false).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Play Requests ────────────────────────────────────────────────────────────

export const playRequests = pgTable('play_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    booking_id: uuid('booking_id')
        .references(() => bookings.id, { onDelete: 'cascade' })
        .notNull(),
    requester_id: uuid('requester_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    recipient_id: uuid('recipient_id')
        .references(() => profiles.id, { onDelete: 'cascade' })
        .notNull(),
    status: text('status').notNull().default('pending'),
    notification_id: uuid('notification_id').references(() => notifications.id, {
        onDelete: 'set null',
    }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    responded_at: timestamp('responded_at', { withTimezone: true }),
})

// ─── OTP Tokens (manager/admin phone login) ──────────────────────────────────

export const otpTokens = pgTable('otp_tokens', {
    id: uuid('id').primaryKey().defaultRandom(),
    phone_number: text('phone_number').notNull(),
    otp: text('otp').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type Profile = typeof profiles.$inferSelect
export type NewProfile = typeof profiles.$inferInsert
export type Court = typeof courts.$inferSelect
export type NewCourt = typeof courts.$inferInsert
export type Equipment = typeof equipment.$inferSelect
export type NewEquipment = typeof equipment.$inferInsert
export type Booking = typeof bookings.$inferSelect
export type NewBooking = typeof bookings.$inferInsert
export type Announcement = typeof announcements.$inferSelect
export type StudentViolation = typeof studentViolations.$inferSelect
export type FeedbackComplaint = typeof feedbackComplaints.$inferSelect
export type Coordinator = typeof coordinators.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type PlayRequest = typeof playRequests.$inferSelect
