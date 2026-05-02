# Database Setup Guide

This directory contains all SQL scripts needed to set up the CampusPlay Sports Court Management System database.

## Quick Start (Fresh Installation)

Follow these steps **in order** to set up a new database:

### 1. Core Schema Setup

Run these scripts in your Supabase SQL Editor:

```sql
-- Step 1: Create base schema with enums and core tables
-- File: 01_base_schema.sql
-- ⚠️ IMPORTANT: This includes the 'superuser' role in the user_role enum
```

```sql
-- Step 2: Add admin-specific tables and features
-- File: 02_admin_schema_extension.sql
```

### 2. Enable Superuser for Testing (Optional)

If you want one account to access all portals (student, manager, admin):

```sql
-- File: enable_superuser.sql
-- Update the email address to your own before running
```

---

## File Descriptions

### Setup Scripts (Run in Order)

| File                            | Description                                              | When to Run                                                  |
| ------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| `01_base_schema.sql`            | Core database schema with tables, enums, RLS policies    | **Required** - First time setup                              |
| `02_admin_schema_extension.sql` | Admin features (equipment, coordinators, feedback, etc.) | **Required** - First time setup                              |
| `enable_superuser.sql`          | Sets a specific user to 'superuser' role for testing     | **Optional** - For developers who need access to all portals |

### Utility Scripts (As Needed)

| File                   | Description                                      | When to Run                 |
| ---------------------- | ------------------------------------------------ | --------------------------- |
| `check_admin_role.sql` | Diagnostic script to check a user's current role | When debugging login issues |

---

## Database Schema Overview

### Enums

- **user_role**: `'student'`, `'manager'`, `'admin'`, `'superuser'`
- **booking_status**: `'pending_confirmation'`, `'confirmed'`, `'waiting_manager'`, `'active'`, `'completed'`, `'cancelled'`, `'rejected'`
- **equipment_condition**: `'good'`, `'minor_damage'`, `'damaged'`, `'lost'`

### Core Tables

- **profiles**: User profiles with roles and student information
- **courts**: Sports courts/facilities
- **bookings**: Court reservations
- **equipment**: Sports equipment inventory
- **announcements**: Admin announcements
- **coordinators**: Sport coordinators information
- **feedback**: Student feedback and complaints
- **defaulters**: List of students who missed bookings

---

## Roles & Permissions

### Student Role (`'student'`)

- Can view their own bookings
- Can create new bookings
- Can view courts and equipment
- Can submit feedback
- **Access**: Student portal only

### Manager Role (`'manager'`)

- All student permissions
- Can approve/reject bookings
- Can manage equipment checkout
- **Access**: Manager and Student portals

### Admin Role (`'admin'`)

- Full database access
- Can manage courts, equipment, coordinators
- Can view analytics and reports
- Can create announcements
- **Access**: Admin, Manager, and Student portals

### Superuser Role (`'superuser'`)

- **Purpose**: Testing and development only
- **Access**: All three portals (student, manager, admin)
- **Note**: Not intended for production use

---

## Common Tasks

### Add a New Admin User

1. User must first sign up through the application
2. Run this SQL to promote them to admin:

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE email = 'user@example.com';
```

### Enable Superuser for Testing

1. Edit `enable_superuser.sql`
2. Change the email to your email address
3. Run in Supabase SQL Editor

### Check User's Current Role

1. Edit `check_admin_role.sql`
2. Change the email to the user's email
3. Run in Supabase SQL Editor

---

## Troubleshooting

### Issue: User redirected to wrong portal

**Cause**: Database role doesn't match expected role  
**Solution**: Run `check_admin_role.sql` to verify role, then update if needed

### Issue: "Invalid enum value" error

**Cause**: Trying to use a role that doesn't exist in the enum  
**Solution**: Check `user_role` enum values in `01_base_schema.sql`

### Issue: Permission denied errors

**Cause**: Row Level Security (RLS) policies blocking access  
**Solution**: Check RLS policies in schema files, ensure user role is correct

---

## Need Help?

- Check the main project README at `../README.md`
- Review Supabase documentation: https://supabase.com/docs
- Contact the development team

---

**Last Updated**: February 2026  
**Database Version**: PostgreSQL 15+ (Supabase)
