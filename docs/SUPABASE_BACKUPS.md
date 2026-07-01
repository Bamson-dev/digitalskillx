# Supabase backup schedule (DigitalSkillX staging)

Check your plan in the Supabase Dashboard: **Project Settings → Billing → Plan**.

| Plan | Automatic daily backups | Point-in-time recovery (PITR) |
|------|-------------------------|-------------------------------|
| **Free** | **No** automatic backups | No |
| **Pro** | Daily backups (retained ~7 days) | Optional add-on |
| **Team / Enterprise** | Daily + longer retention | PITR available |

## Action required before launch

1. Open your staging project in [Supabase Dashboard](https://supabase.com/dashboard).
2. Confirm the plan under **Billing**.
3. If you are on **Free**: **upgrade to Pro** (or higher) before accepting real payments — the Free tier has **no automatic backups**.
4. Enable **PITR** on production if you need restore to any second within the retention window.

## Manual backup (any plan)

```bash
supabase db dump --db-url "$DATABASE_URL" -f backup-$(date +%Y%m%d).sql
```

Store dumps off-site (encrypted S3, etc.) before major migrations.
