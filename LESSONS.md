# Lessons Learned

Hard-won rules from production incidents. Read before touching infrastructure.

## Docker & Database

**Container has no source files.** The production Docker image only contains `.next` build output, `node_modules`, and `package.json`. You cannot `docker cp` TypeScript files into the container and run them. For DB operations, use `psql` directly via `docker exec`.

**DATABASE_URL is not available on the host.** The PostgreSQL container (`abc_ancdb`) is on Docker's internal network (`easypanel-abc`). The host machine cannot reach it by IP. All DB operations must go through:
```bash
docker exec $(docker ps -q -f name=abc_ancdb) psql -U ancdb -d ancdb -c 'YOUR SQL HERE'
```

**Schema changes go through the running app container.** Copy the updated `schema.prisma` into the app container, then run `prisma db push` from inside it:
```bash
docker cp prisma/schema.prisma abc_ancapp.1.XXXXX:/app/prisma/schema.prisma
docker exec abc_ancapp.1.XXXXX npx prisma db push
```
Get the container name from `docker ps --format '{{.Names}}' | grep abc_ancapp`.

**Docker inspect returns multiple IPs.** The `abc_ancdb` container is on two networks (`easypanel` and `easypanel-abc`). Neither IP is reachable from the host. Don't waste time trying direct connections.

## Backups

**Always take a fresh backup before migrations.** No exceptions. The command:
```bash
docker exec $(docker ps -q -f name=abc_ancdb) pg_dumpall -U ancdb 2>/dev/null \
  | gzip > /root/backups/db/ancdb_pre-migration_$(date +%Y%m%d-%H%M%S).sql.gz
```

**Automated backups run daily at 3 AM CET.** Script: `/usr/local/bin/backup-anc.sh`. Logs: `/var/log/anc-backup.log`. Local: `/root/backups/db/`. Offsite: `u567007.your-storagebox.de` via rsync over SSH port 23. Retention: 7 days.

**Restore command** (if needed):
```bash
gunzip -c /root/backups/db/ancdb_YYYY-MM-DD_HHMM.sql.gz \
  | docker exec -i $(docker ps -q -f name=abc_ancdb) psql -U ancdb -d ancdb
```

## Architecture Rules

**No silent fallbacks.** If Gemini fails, throw the error. If the DB is unreachable, throw. Don't catch errors and silently fall back to stale data. The user needs to see what broke, not a degraded result that looks correct but isn't.

**Products live in the DB only.** `ManufacturerProduct` table is the single source of truth. The `ProductMatcher` reads from Prisma — no hardcoded catalog fallback. If the DB is down, the whole app is down anyway. The old hardcoded files (`productCatalog.ts`, `led-products.ts`) remain in the codebase but are not imported by the matcher.

**Trust per-display environment from the RFP.** Don't override individual display environments with a project-level flag. Mixed indoor/outdoor projects are common. A project-level `isOutdoor: false` was force-converting all outdoor displays to indoor, causing the matcher to select 3.9mm indoor products for 10mm outdoor screens.

## Gemini Extraction

**Gemini API key format: `AIzaSy...` (39 chars).** Keys starting with `AQ.` are invalid OAuth tokens, not API keys. Get real keys from https://aistudio.google.com/apikeys. Env var: `GEMINI_API_KEY`.

**Use inline base64 for PDFs under 15MB.** The Gemini File API upload can fail from Docker environments. Inline base64 in the request body is simpler and more reliable. Over 15MB, the File API is required.

**Gemini returns generic names if the prompt isn't explicit.** The schema example `"name": "Screen Name"` caused the model to return "LED Display" for every row. The prompt must say: "Use the ACTUAL room/location name from the document."

**Gemini model availability changes.** `gemini-2.0-flash` was deprecated for new users while `gemini-2.5-flash` works. Always use the `GEMINI_EXTRACTION_MODEL` env var so the model can be changed without code deploys.

## Product Matching

**Mesh products must be penalized for solid-panel applications.** Without a penalty, `LG Mesh P10 FM1921 3.9mm` (an indoor mesh/transparent panel) was matching for indoor videoboards because it had the closest pitch. Add +50 score penalty for `/mesh|transparent|see.?through/i` patterns.

**Nits matching matters.** A 6000-nit product should not match a spec requiring 8000 nits. Add +20 penalty when `product.maxNits < spec.brightnessNits`.

**The `Mesh P10 FM1921 3.9mm` product is tagged as indoor but is actually a transparent mesh panel.** It should not be the default match for any solid indoor display. The mesh penalty in the matcher handles this, but if more mesh products are added to the DB, tag them appropriately.

## Deployment

**No local dev. Code, commit, push.** EasyPanel auto-builds from `phase2/product-database`. Don't test locally — just push and verify on production.

**Env vars are in EasyPanel, not in `.env` files.** The repo has no `.env`. All keys are configured in EasyPanel's service environment section. After changing an env var, the container must restart to pick it up.

**Never push while a previous commit is still building.** Wait for the EasyPanel build to finish before pushing the next commit. Stacking commits during a build can cause it to pick up a half-finished state, or worse, auto-deploy triggers on an intermediate commit that doesn't include all the fixes. One commit, one build, one deploy, verify, then next.

**The entrypoint runs `npx prisma db push --accept-data-loss`.** New schema fields are applied automatically on container restart. But if you add fields that conflict with existing data, this can drop columns. Only add nullable fields or fields with defaults.

## Communication

**Avoid the word "fallback."** Use "secondary lookup" or "backup path" instead. "Fallback" implies graceful degradation — in practice it means silent failure. If there IS a legitimate reason for a backup path, explain WHY it exists and what happens if it fails. Document the failure mode, not just the happy path.

**Avoid "hardcoded."** Use "static file" or "in-code data" instead. "Hardcoded" sounds temporary and acceptable. It isn't. Data that changes (products, rates, pricing) belongs in the database. Code that references static data should be called out as tech debt, not described with a neutral term.

**Never frame silent failure recovery as a feature.** If something fails, say it failed. A try/catch that swallows an error and returns stale data is not "resilience" — it's hiding a problem. The user sees incorrect results and trusts them. The developer never finds out the primary path is broken. If an error is caught, it must be surfaced: logged with context, shown to the user, or both.
