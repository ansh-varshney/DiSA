CREATE TYPE "public"."booking_status" AS ENUM('pending_confirmation', 'confirmed', 'waiting_manager', 'active', 'completed', 'cancelled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."complaint_status" AS ENUM('open', 'in_progress', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."court_condition" AS ENUM('excellent', 'good', 'needs_maintenance');--> statement-breakpoint
CREATE TYPE "public"."equipment_condition" AS ENUM('good', 'minor_damage', 'damaged', 'lost');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'manager', 'admin', 'superuser');--> statement-breakpoint
CREATE TYPE "public"."violation_severity" AS ENUM('minor', 'moderate', 'severe');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"court_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'pending_confirmation',
	"players_list" jsonb,
	"equipment_ids" uuid[] DEFAULT '{}',
	"is_maintenance" boolean DEFAULT false,
	"is_priority" boolean DEFAULT false,
	"num_players" integer DEFAULT 2,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coordinators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"sport" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"type" text,
	"capacity" integer DEFAULT 4,
	"is_active" boolean DEFAULT true,
	"maintenance_notes" text,
	"condition" "court_condition" DEFAULT 'good',
	"last_maintenance_date" date,
	"usage_count" integer DEFAULT 0,
	"pictures" text[],
	"notes" text,
	"court_id" text,
	"next_check_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courts_court_id_unique" UNIQUE("court_id")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sport" text NOT NULL,
	"condition" "equipment_condition" DEFAULT 'good',
	"is_available" boolean DEFAULT true,
	"total_usage_count" integer DEFAULT 0,
	"vendor_name" text,
	"cost" numeric(10, 2),
	"purchase_date" date,
	"expected_lifespan_days" integer DEFAULT 365,
	"pictures" text[] DEFAULT '{}',
	"notes" text DEFAULT '',
	"equipment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_equipment_id_unique" UNIQUE("equipment_id")
);
--> statement-breakpoint
CREATE TABLE "feedback_complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "complaint_status" DEFAULT 'open',
	"resolved_by" uuid,
	"category" text DEFAULT 'general' NOT NULL,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sender_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notification_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"full_name" text,
	"role" "user_role" DEFAULT 'student',
	"phone_number" text,
	"avatar_url" text,
	"student_id" text,
	"branch" text,
	"points" integer DEFAULT 0,
	"is_eligible_for_consecutive" boolean DEFAULT false,
	"gender" text,
	"year" text,
	"banned_until" timestamp with time zone,
	"last_points_reset" date,
	"priority_booking_remaining" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "student_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"violation_type" text NOT NULL,
	"severity" "violation_severity" DEFAULT 'minor',
	"reason" text NOT NULL,
	"reported_by" uuid,
	"points_deducted" integer DEFAULT 0,
	"booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_complaints" ADD CONSTRAINT "feedback_complaints_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_complaints" ADD CONSTRAINT "feedback_complaints_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_complaints" ADD CONSTRAINT "feedback_complaints_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_profiles_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_requests" ADD CONSTRAINT "play_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_requests" ADD CONSTRAINT "play_requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_requests" ADD CONSTRAINT "play_requests_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_requests" ADD CONSTRAINT "play_requests_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_violations" ADD CONSTRAINT "student_violations_student_id_profiles_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_violations" ADD CONSTRAINT "student_violations_reported_by_profiles_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_violations" ADD CONSTRAINT "student_violations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;