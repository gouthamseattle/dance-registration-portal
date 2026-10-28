# Dance Registration Portal

Registration and payment portal for DDC dance classes.
Students register on their phones (links shared on WhatsApp), pay by Venmo or Zelle,
and an admin confirms payment, which sends a confirmation email.
Scale is small (50–100 concurrent users): prefer simple over clever.

**Scope (deliberately small):**
- Class types: Drop-in (1 or 2 classes), Series (more than 2 classes, choreography or technique), Crew Practice (1 class).
- Admin portal features:
  - Create classes
  - Review, confirm or cancel registrations, with reports
  - Student management (GouMo students vs crew members)
  - Waitlist
  - Dashboard stats
  - Minimal settings (Venmo, Zelle, email on/off, registration open/closed)

Competition, choreography packages, attendance and historical classification were removed in Oct 2026. Their old database tables still exist but are unused.

The owner is a data engineer, not a front-end developer. Explain front-end and
web concepts in plain terms when they come up.

## Where things are

| Area | Files |
|---|---|
| Server and all API routes | `server.js` (large; search by route path, e.g. `'/api/register'`) |
| DB connection (SQLite locally, Postgres when `DATABASE_URL` is set) | `database-config.js` |
| Schema creation and migrations, run at startup | `database/initialize.js`, `scripts/migrate-to-postgres.js` |
| Login check, async error wrapper | `middleware/auth.js` |
| Email (Gmail SMTP via nodemailer) | `utils/mailer.js` |
| Capacity, schedule helpers | `utils/courseAvailability.js`, `utils/schedule.js` |
| Home page (served at `/`): brand, live class list, instructors | `public/home.html`, `public/js/home.js` |
| Design system (colors, fonts, buttons, cards), use it for every new page | `public/css/site.css` |
| Registration flow: email, then profile, then pick class (`?course=ID` preselects) | `public/email-profile.html`, `public/js/email-profile-registration.js` |
| Registration form + payment (Venmo/Zelle) | `public/index-registration.html`, `public/js/registration.js` |
| Registration pages' look: re-skins Bootstrap with the design-system tokens | `public/css/registration.css` |
| Admin dashboard | `public/admin.html`, `public/js/admin.js`, `public/css/admin-styles.css` |
| Smoke tests | `test/smoke.test.js`, run in CI by `.github/workflows/test.yml` |

`memory-bank/` and `docs/` are historical notes from earlier development. Read them only when a task needs that history.

## Working rules

- **Keep token cost low.** Read only the files and line ranges a task needs. Use grep to find a route or function instead of reading whole large files.
- **Branch, test, then merge.** Work on a branch. Push and let GitHub Actions run the tests. Merge to `main` only when tests pass. Railway deploys `main` to production automatically, so `main` must always be safe.
- **Never test against production.** Tests start the server against a throwaway database. Never point `DATABASE_URL` at Railway when running tests.
- **Add a test when you add or fix a flow.** Add it to `test/smoke.test.js`, following the existing pattern of HTTP calls against the running server.
- **Database changes must be additive and idempotent.** Add schema changes to `database/initialize.js` using `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`, since they run on every startup. Write SQL with `$1, $2` placeholders; the code converts them for both SQLite and Postgres. Postgres needs `RETURNING id` to get the new row's id.
- **Admin-only routes must use `requireAuth`.** Any route that changes data and isn't part of the public student flow needs it.
- **Bump the cache version when editing front-end files.** Increase the `?v=` number in the HTML `<script>` and `<link>` tags so phones load the new version.
- **Payments are Venmo and Zelle only.** The PayPal code is legacy.

## Commands

```bash
npm install          # install packages
npm run dev          # run locally (SQLite) at http://localhost:3000, admin at /admin
npm test             # smoke tests (needs DATABASE_URL to a throwaway Postgres, DATABASE_SSL=false)
```

## Production (Railway)

- Pushing to `main` deploys automatically.
- Required variables:
  - `DATABASE_URL`
  - `NODE_ENV=production`
  - `SESSION_SECRET`
  - `ADMIN_PASSWORD` (sets the admin login password on each startup)
  - `GMAIL_USER`
  - `GMAIL_APP_PASSWORD`
- If production breaks, first check that the Railway variables above are all present.
