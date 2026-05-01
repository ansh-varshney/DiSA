# supabase_premigration

Pre-migration archive. These files were part of the original Supabase-based stack and are **no longer used** in production.

The application has been migrated to:

- **Auth**: Auth.js v5 (NextAuth) with Google OAuth
- **Database ORM**: Drizzle ORM with `postgres` driver
- **Storage**: Local disk (`public/uploads/`) served statically by Next.js
- **RLS**: Removed — authorization enforced at the server-action layer via `src/lib/auth-guards.ts`

---

## Contents

| Directory      | What it was                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `clients/`     | Supabase client instantiation helpers (`createBrowserClient`, `createServerClient`, `createClient` admin)                            |
| `types/`       | Auto-generated TypeScript types for the Supabase schema (`Database` type)                                                            |
| `mocks/`       | Vitest mock builder for the Supabase client (used in old test suite)                                                                 |
| `sql/schema/`  | Ordered Supabase SQL migration files (01–05) that set up the original schema, enums, RLS policies, and stored procedures             |
| `sql/patches/` | Incremental SQL patches applied to the Supabase instance over time (field additions, RLS tweaks, enum updates, storage bucket setup) |

---

## Current database setup

The live schema is managed by Drizzle ORM:

- Schema definition: `src/db/schema.ts`
- Migrations: `drizzle/` (run via `npm run db:migrate`)
- Stored procedures: `src/db/stored-procedures.sql` (apply once to Postgres manually)
- Config: `drizzle.config.ts`
