# Database migrations

`npm run db:migrate` applies pending SQL files, in filename order, to `DATABASE_URL`.

Sources, applied in this order:

1. `supabase/migrations/*.sql` is the frozen history that produced the schema the production database was restored from.
2. `db/migrations/*.sql` holds every new migration. Name files `NNNN_description.sql` with a number above the last frozen file.

Rules:

- Migrations are additive and idempotent (`create table if not exists`, `add column if not exists`).
- Each file runs in one transaction. A failure rolls that file back and stops the run.
- Applied files are recorded in `public.schema_migrations` with a checksum. A changed checksum on an applied file stops the run.
- The first run on an existing database records every frozen file up to `DB_BASELINE_THROUGH` (default `0057`) as already applied, because the restored database already contains them.

Commands:

- `npm run db:migrate` apply pending migrations
- `npm run db:migrate -- --status` list applied and pending files
- `npm run db:migrate -- --dry-run` print what would run
