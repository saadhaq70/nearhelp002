# Database Migrations

This folder contains database migration scripts for the NearHelp project.

## Migration Approach

This project uses **Prisma** with **NeonDB PostgreSQL** for database management. Migrations are handled through Prisma's migration system.

## How to Run Migrations

### Using Prisma Migrate (Recommended)

```bash
# Navigate to backend directory
cd backend

# Generate Prisma client
npx prisma generate

# Create a new migration (after modifying schema.prisma)
npx prisma migrate dev --name your_migration_name

# Apply migrations to production
npx prisma migrate deploy

# Reset database (WARNING: This will delete all data)
npx prisma migrate reset
```

### Manual SQL Migrations

If you need to run SQL migrations directly:

```bash
# Connect to your database using psql or any PostgreSQL client
# Then run the SQL files in order
```

## Available SQL Migrations

These are legacy SQL migration files that can be applied manually if needed:

### 001_fix_sos_schema.sql
**Purpose:** Fixes the SOS table schema to match the application requirements.

### 002_add_resolution_columns.sql
**Purpose:** Adds resolution tracking columns to the SOS table.

### 003_cleanup_stale_sos.sql
**Purpose:** Cleans up stale SOS records.

### 004_resolve_all_active_sos.sql
**Purpose:** Resolves all active SOS records (use with caution).

### add_one_star_count.sql
**Purpose:** Adds rating tracking to the database.

## Prisma Schema

The source of truth for the database schema is:
```
backend/prisma/schema.prisma
```

All schema changes should be made there, then applied using Prisma Migrate.

## Verification

After running migrations, verify your database schema:

```bash
# View current database schema
npx prisma db pull

# Open Prisma Studio to browse data
npx prisma studio
```

## Troubleshooting

### "Migration failed" errors
1. Check your DATABASE_URL in `.env` is correct
2. Ensure NeonDB connection is active
3. Check Prisma logs for specific error messages

### Schema out of sync
```bash
# Regenerate Prisma client
npx prisma generate

# Push schema without creating migration
npx prisma db push
```

### Connection issues
- Verify NeonDB is accessible
- Check DATABASE_URL format: `postgresql://user:password@host/database?sslmode=require`
- Ensure SSL mode is set to `require` for NeonDB

## Database URL Format

Your `.env` should contain:
```
DATABASE_URL=postgresql://username:password@host:port/database?sslmode=require
```

For NeonDB, the connection string follows this format.
