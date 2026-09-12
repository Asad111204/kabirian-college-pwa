# Deployment

How the Nova School Kamalia Management System goes live and stays live. **Everything here is done afresh for Nova School Kamalia — a new Neon project, a new Google Cloud OAuth client and a new Google account for Drive.** No credential, database or Drive from any other deployment is reused. Written for the person who runs it, not for a hosting expert; every step says what it is for.

The app is a plain Node server: Next.js, one PostgreSQL database (Neon), and Google Drive for files. It runs in two ways, and both are supported:

| | **Vercel** (recommended to start) | **Docker** (Railway, Render, a VPS) |
|---|---|---|
| Cost | Free (Hobby) | Free tiers come and go; a small VPS is a few dollars a month |
| Set-up | Connect the GitHub repo, set the variables, done | Build the image from the `Dockerfile`, run it with the variables |
| Upload limit | **4 MB per file** (Vercel's request limit is 4.5 MB) | Whatever `UPLOAD_MAX_SIZE_MB` says (10 by default) |
| Rate limits | Per-account limits reset when Vercel starts a new instance; the account lockout in the database still holds | Exactly as designed |
| Deploys | Every push to `main` | You build and restart |

Decision and reasoning: ADR-163 in `DECISIONS.md`. Start on Vercel; move to Docker only if 4 MB uploads become a real problem for the office.

---

## 1. The database (Neon)

1. Create a project on [neon.tech](https://neon.tech) (free tier) in a region near Pakistan (Singapore is the closest). Neon keeps **point-in-time history** — on the free tier, the last 6 hours; on paid plans, days. That is the first line of defence against a mistake; the school's own backups (section 6) are the second.
2. From the Neon dashboard copy two connection strings:
   - the **pooled** one (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** one → `DATABASE_DIRECT_URL`, used only for migrations from your own computer
3. Apply the migrations from your computer, never from the host:
   ```
   npm run db:migrate
   ```
4. Seed the reference data (permissions, designations, document types) and the school's structure, then create the first administrator:
   ```
   npm run seed:reference
   npm run seed:structure
   npm run create-admin -- --username principal --name "Principal Sahib"
   ```
   The temporary password is shown once; it must be changed at first sign-in.
5. **Least privilege** (optional but recommended before real data): run `scripts/db-least-privilege.sql` in Neon's SQL editor as the owner role, with a fresh password in place of the placeholder. Then use `nova_school_app` in the pooled `DATABASE_URL` on the host. The owner role stays on your computer for migrations, backups and restores.

## 2. Google Drive (files)

Documents (photos, CNIC scans, result cards, notice attachments) live in a Google Drive the school owns — a Google account created for Nova School Kamalia — under folders the app creates. Nothing is ever shared publicly; the app streams files to signed-in users.

1. In Google Cloud Console → **APIs & Services → Credentials → your OAuth client**, add the **production redirect URI** to *Authorised redirect URIs*: `https://<your-domain>/api/v1/settings/google/callback`. Keep the localhost one as well, so the app still connects from a laptop. For example:
   ```
   https://<your-domain>/api/v1/settings/google/callback
   http://localhost:3000/api/v1/settings/google/callback
   ```
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `STORAGE_PROVIDER=google_drive` on the host. `GOOGLE_OAUTH_REDIRECT_URI` is **derived from `APP_URL`** unless you set it, so getting `APP_URL` right is usually enough.
3. After the first deploy, sign in as an administrator → **Settings → Google Drive → Connect**, sign in as the school's Google account, and press **Create folders**. The refresh token is stored encrypted with `APP_ENCRYPTION_KEY`.

**The connection lives in the database, not in the code.** Connecting stores two rows in `settings` (the account record and the refresh token, encrypted with `APP_ENCRYPTION_KEY`). So:

- if the deployed site shows Drive as **not connected**, either nobody has pressed **Connect** against *that database*, or the rows are gone — connect again from Settings;
- if `APP_ENCRYPTION_KEY` on the host differs from the one used when connecting, the stored token cannot be read and every Drive action fails until you reconnect. Keep that key identical wherever the app runs against the same database, and never regenerate it casually.

If the app moves to a new domain, repeat step 1 and reconnect.

## 3. Variables the host needs

Copy from `.env.example`; every one is explained there. The ones that matter most:

| Variable | Production value |
|---|---|
| `APP_URL` | `https://<your-domain>` — exactly, no trailing slash. Sign-in refuses requests from any other origin. |
| `APP_COLLEGE_NAME` | The school's name as it should appear — `Nova School Kamalia` |
| `APP_TIMEZONE` | `Asia/Karachi` |
| `APP_ENCRYPTION_KEY` | 32 random bytes, base64: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Losing it means reconnecting Google Drive; changing it does the same.** |
| `DATABASE_URL` | Neon's pooled string (`nova_school_app` after section 1.5) |
| `DATABASE_POOL_MAX` | `3` on Vercel (many small instances share Neon's connection limit); `10` in Docker |
| `DATABASE_DIRECT_URL` | **Do not set on the host.** Your computer only. |
| `LOG_LEVEL` | `info` |
| `UPLOAD_MAX_SIZE_MB` | `4` on Vercel; `10` in Docker. On Vercel also set each PDF document type's limit to 4 MB under Settings → Document types. |
| `STORAGE_PROVIDER`, `GOOGLE_*` | Section 2 |

Never put these in the repository. `.env` is git-ignored; the host's environment settings are the only place for production values.

## 4. Vercel, step by step

1. Import the GitHub repository at vercel.com → **Add New → Project**. Framework: Next.js (detected). Build command: `npm run build` (already runs `prisma generate`).
2. **Environment Variables**: add every variable from section 3 for *Production*. Do not add `DATABASE_DIRECT_URL`.
3. Deploy. The first deploy fails only if a variable is missing — the message names it.
4. **Domain**: Settings → Domains → add the school's domain and follow the DNS instructions (a CNAME to Vercel). HTTPS is automatic. Then set `APP_URL` to the `https://` domain and redeploy.
5. Open `https://<domain>/api/v1/health` — it must say `"status":"ok"` with `"database":"ok"`.
6. Sign in as the first administrator, change the password, connect Google Drive (section 2).

Every later push to `main` deploys automatically. CI (`.github/workflows/ci.yml`) runs the full test suite, the production harness and the browser tests on every push; look at the **Actions** tab on GitHub before trusting a deploy.

## 5. Docker, step by step

```
docker build -t nova-school-kamalia .
docker run -d --name nova-school -p 3000:3000 --env-file /path/to/production.env --restart unless-stopped nova-school-kamalia
```

Put a TLS proxy in front (Caddy is the simplest: two lines of config and automatic certificates) so the app is reached as `https://<domain>`, and set `APP_URL` accordingly. The image has a health check on `/api/v1/health`; Railway and Render read it automatically.

## 6. Backups and the restore drill

Neon's history covers "undo the last few hours". The school's own backup covers "the account was lost", "the region was down" and "we want a copy we hold":

```
npm run backup:export                          # → backups/<timestamp>/ (every table as JSON)
npm run backup:restore -- --from backups/<timestamp>          # dry run: says what it would do
npm run backup:restore -- --from backups/<timestamp> --yes    # empties every table and puts the backup back
```

- Run the export **weekly** on the administrator's computer with `DATABASE_URL` set to the production string, and copy the folder to a drive the school controls (an external disk, or the school's Google Drive by hand). It contains everything — names, CNICs, password hashes — so keep it where only the administration can reach it.
- A restore refuses to run against a database whose migrations differ from the backup's, and runs in one transaction: either everything lands or nothing changes.
- **Restore drill**: the harness performs one on every CI run (`node tests/harness/run.mjs --backup-drill`) — export, damage, restore, verify counts and a sign-in. Before go-live, do it once against a **Neon branch** of the real database (Neon → Branches → create from main; point `DATABASE_URL` at the branch; export, restore, check), so the procedure has been done by a person on real data. Never restore onto the main branch unless you mean to.
- Files in Google Drive are not in this backup: Drive keeps them, and its own trash and version history apply.

## 7. Monitoring

- **Health**: `https://<domain>/api/v1/health`. Create a free monitor at [UptimeRobot](https://uptimerobot.com) (or any similar service) that requests it every 5 minutes and emails when it is not `200`. It reveals nothing sensitive.
- **Errors**: the app logs one JSON line per event with passwords, tokens and national IDs redacted. On Vercel: project → **Logs**; in Docker: `docker logs nova-school`. Look for `"level":"error"`.
- **Audit**: Admin → Audit Log shows what people did; it is the first place to look when someone asks "who changed this".
- **Dependencies**: CI fails on any unreviewed high-severity advisory (`npm run audit`); the allowlist in `.audit-allowlist.json` names the accepted ones and when to look again.

## 8. Go-live checklist

- [ ] Neon project created; migrations applied; reference and structure seeds run; first administrator created and password changed
- [ ] Least-privilege role in place; host uses `nova_school_app`
- [ ] Host variables set; `APP_URL` is the real `https://` domain; `DATABASE_DIRECT_URL` absent from the host
- [ ] Domain and HTTPS working; `/api/v1/health` is `ok`
- [ ] Google Drive connected as the school's account; folders created; one test upload and download
- [ ] On Vercel: `UPLOAD_MAX_SIZE_MB=4` and PDF document types capped at 4 MB
- [ ] Uptime monitor on `/api/v1/health`
- [ ] First backup exported and copied off the host; restore drill done on a Neon branch
- [ ] Real data imported (`docs/HANDOVER.md` § Importing students), spot-checked against the paper register
- [ ] Every user's temporary password handed over in person; nobody shares an account
- [ ] Installed on one Android phone and one iPhone (Phase 15 checklist) to confirm the app installs and the offline page appears in aeroplane mode
