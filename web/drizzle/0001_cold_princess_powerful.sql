ALTER TABLE "courts" ALTER COLUMN "condition" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "courts" ALTER COLUMN "condition" SET DEFAULT 'good'::text;--> statement-breakpoint
DROP TYPE "public"."court_condition";--> statement-breakpoint
CREATE TYPE "public"."court_condition" AS ENUM('good', 'minor_damage', 'damaged');--> statement-breakpoint
ALTER TABLE "courts" ALTER COLUMN "condition" SET DEFAULT 'good'::"public"."court_condition";--> statement-breakpoint
ALTER TABLE "courts" ALTER COLUMN "condition" SET DATA TYPE "public"."court_condition" USING "condition"::"public"."court_condition";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "notes" text;