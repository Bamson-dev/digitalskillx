# Storage backup and persistent storage migration (2026-10-10)

Nothing here was run. The container terminal was not available to this session, so the contents of /app/.data/storage are unknown.

## Why this matters
In production the app writes some files to /app/.data/storage inside the container. Coolify has no persistent volume. Every redeploy replaces the container and removes those files. The merge of PR 1 triggers a deploy, so back up first.

Files at risk, by route: admin sales-page assets (upload, delete), public sales-page-assets download, landing-assets, learn artwork, landing import output, content factory artwork. Course resources and lesson attachments are not at risk, they use Supabase storage while Contabo storage is unconfigured.

## Code guard (already in the branch)
In production, with no STORAGE_LOCAL_ROOT, upload, replace, copy and move on the local adapter fail with the message Storage write blocked. Reads, exists and delete still work. A failed replace leaves the existing file untouched (regression test in CI). Impact until storage is set: admin sales-page asset uploads, landing import and content factory artwork writes return an error. Set STORAGE_ALLOW_EPHEMERAL=1 only to accept data loss on the next deploy.

## Procedure (owner, in this order)
1. Inventory. In the Coolify terminal for the app run: find /app/.data/storage -type f | wc -l ; du -sh /app/.data/storage ; find /app/.data/storage -maxdepth 2 -type d. An empty or missing directory means nothing to migrate.
2. Cross-check. For each route above, list the database rows that point at stored files and note the count. Rows without a file are already broken. Files without a row are orphans, keep them in the backup.
3. Back up. Run tar czf /tmp/storage-backup.tgz -C /app/.data storage, copy the archive off the host (scp from the VPS to a machine you control), run tar tzf on the copy and compare the file count with step 1, and store sha256sum of the archive. Keep it 30 days.
4. Choose the target.
   - Preferred: Contabo Object Storage. Set STORAGE_PROVIDER=s3 with CONTABO_S3_ENDPOINT, CONTABO_S3_BUCKET, CONTABO_S3_ACCESS_KEY and CONTABO_S3_SECRET_KEY as Coolify secrets. Survives any redeploy and any host move.
   - Alternative: a Coolify persistent volume mounted at a new path such as /data/storage with STORAGE_LOCAL_ROOT=/data/storage. Do not mount over /app/.data/storage, because a mount hides whatever the container holds there.
5. Copy. Extract the backup and copy files into the target with the same relative paths. For S3 use an S3 client against the Contabo endpoint with the same keys as the paths. Compare counts.
6. Switch and redeploy. Set the variables, redeploy through the release workflow, then check one asset per route.
7. Prove persistence. Redeploy a second time with no code change and check the same assets again. Only then close the item.
8. Rollback. Remove the new variables to return to the local adapter. The backup stays the recovery copy.

## Checks that stay read-only for the agent
scripts/certification/test-contabo-storage.mjs runs a live S3 round trip against the configured endpoint. Run it only with the real S3 variables in the shell of the owner, never in CI.
