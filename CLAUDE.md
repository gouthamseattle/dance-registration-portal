# Dance Registration Portal

Registration and payment portal for DDC dance classes.
Students register on their phones (links shared on WhatsApp), pay by Venmo or Zelle,
and an admin confirms payment, which sends a confirmation email.
Scale is small (50–100 concurrent users): prefer simple over clever.

**Scope (deliberately small):**
- Class types: Drop-in (1 or 2 classes), Series (more than 2 classes, choreography or technique), Crew Practice (1 or more dates, fee per practice; students pick dates).
- Admin portal features:
  - Create classes
  - Review, confirm or cancel registrations, with reports
  - Student management (GouMo students vs crew members)
  - Waitlist
  - Dashboard stats
  - Minimal settings (Venmo, Zelle on/off, email on/off, registration open/closed)

**Class model:** one class is one group at one time.
- **Stored on the class:** name, type, `song_name` (shown as "Song / Style"), `instructor`, `required_student_type` (`any` | `crew_member`) and `session_dates` (a JSON array of `YYYY-MM-DD`).
- **Stored on its single slot:** start/end time, location and capacity.
- **Slot pricing:** `full_package` is the fee for all dates; `drop_in` is the per-date fee.
- **Registrations** can store `selected_dates`. When a student picks dates, the server computes the amount.
- **Per-class registration switch:** `courses.registration_open` (NULL/true = open), toggled from the dashboard via `PUT /api/courses/:id/registration-open`. The global `registration_open` setting still closes everything.
- **When a registration is saved:** checkout calls `/api/register` (or `/api/register-combo`) with `dry_run: true` to check and price it, and saves it only when the student taps "I've sent the payment".
- **Display:** dates, fees and labels for students are formatted in `public/js/class-info.js`.
- **Combos:** `combos` (name, price, is_active) + `combo_classes` (combo_id, course_id) bundle 2+ classes at one price. `POST /api/register-combo` creates one pending registration per class, price split across them, sharing `registrations.combo_group`; confirm, cancel and uncancel apply to the whole group.

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
| Email: Gmail API over HTTPS when `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET`/`GMAIL_REFRESH_TOKEN` are set (Railway Hobby blocks SMTP), else Gmail SMTP. Admin → Settings → Test email shows the method and errors | `utils/mailer.js` |
| Capacity, schedule helpers | `utils/courseAvailability.js`, `utils/schedule.js` |
| Home page (served at `/`): brand, live class list, instructors | `public/home.html`, `public/js/home.js` |
| Design system (colors, fonts, buttons, cards), use it for every new page | `public/css/site.css` |
| Registration flow: email, then profile, then pick class (`?course=ID` preselects) | `public/email-profile.html`, `public/js/email-profile-registration.js` |
| Registration form + payment (Venmo/Zelle) | `public/index-registration.html`, `public/js/registration.js` |
| Bootstrap re-skin with the design-system tokens (registration pages and admin) | `public/css/registration.css` |
| Admin portal: Dashboard (stats + per-class report), Classes & combos, Registrations, Waitlists, Students, Settings | `public/admin.html`, `public/js/admin.js`, `public/css/admin.css` (loads after `site.css` and `registration.css`) |
| Shared class formatting for student pages (dates, times, fees) | `public/js/class-info.js` |
| Crew link `/crew` (serves `email-profile.html` with its own WhatsApp preview tags, then switches the address to `?crew=1`; lists only crew-only classes). The home page leaves crew-only classes and combos out | `server.js`, `email-profile-registration.js`, `home.js` |
| Student "My classes" page at `/my` (email sign-in, upcoming/past classes, payment status, waitlists, edit details) | `public/my.html`, `public/js/my.js`, API `/api/my/profile` |
| Admin student profile (history, totals, private `admin_notes`) | modal in `admin.js` (`openStudent`), API `/api/admin/students/:id` |
| Student cleanup: hide/restore (`students.archived_at`, nothing deleted), bulk type change, Data check (duplicates by email, unlinked registrations, old tables) | `admin.js`, APIs `/api/admin/students/bulk`, `/api/admin/data-check` |
| Test accounts: `students.is_tester`; their registrations get `registrations.is_test` and are left out of spot counts (`NOT_TEST` in SQL) and dashboard numbers; they bypass full/closed/crew-only; admin can reset them; the device flag `goumo_tester` (set by `/my`) only changes what pages show | `server.js`, `utils/courseAvailability.js`, `admin.js`, `my.js` |
| Waitlist offers: cancelling a *paid* registration (admin only; students can't cancel) emails the next waitlisted student a `/waitlist-register/:token` link and holds the spot for `waitlist_hold_hours` (Settings, default 24). Held spots (`heldSpots`) don't count as free; expired offers move to the next person (10-minute check). The token rides along as `?waitlist=` / `waitlist_token` | `server.js` (`offerOpenSpots`, `expireWaitlistOffers`), `email-profile-registration.js`, `registration.js` |
| Lite admin `/admin-lite` for approved helpers (`team_members`: email + own password set on first sign-in; Settings → Other admins). Helpers use the same registrations list/export/confirm/cancel routes via `requireAdminOrTeam` + `liteCourseGuard`, limited to classes open or closed in the last 7 days (`courses.registration_closed_at`, kept by `syncClosedAt`); test registrations hidden; `registrations.handled_by` records who acted | `server.js`, `public/admin-lite.html`, `public/js/admin-lite.js`, `public/css/admin-lite.css` |
| Smoke tests | `test/smoke.test.js`, run in CI by `.github/workflows/test.yml` |

**Read `docs/PROJECT_NOTES.md` at the start of every session.** It has the live links (site, admin, design mockups), the decisions and why they were made, brand rules, setup outside the code (Google Cloud, Railway) and the to-do list. Update it in the same PR as any change that adds a decision, link or to-do.

The rest of `docs/` and `memory-bank/` are historical notes from earlier development. Read them only when a task needs that history.

## Working rules

- **Keep token cost low.** Read only the files and line ranges a task needs. Use grep to find a route or function instead of reading whole large files.
- **Branch, test, then merge.** Work on a branch. Push and let GitHub Actions run the tests. Merge to `main` only when tests pass. Railway deploys `main` to production automatically, so `main` must always be safe.
- **Never test against production.** Tests start the server against a throwaway database. Never point `DATABASE_URL` at Railway when running tests.
- **Add a test when you add or fix a flow.** Add it to `test/smoke.test.js`, following the existing pattern of HTTP calls against the running server.
- **Database changes must be additive and idempotent.** Add schema changes to `database/initialize.js` using `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`, since they run on every startup. Write SQL with `$1, $2` placeholders; the code converts them for both SQLite and Postgres. Postgres needs `RETURNING id` to get the new row's id.
- **Admin-only routes must use `requireAuth`.** Any route that changes data and isn't part of the public student flow needs it.
- **Bump the cache version when editing front-end files.** Increase the `?v=` number in the HTML `<script>` and `<link>` tags so phones load the new version.
- **Payments are Venmo (and Zelle only when `zelle_enabled` is on in Settings; off by default).** The PayPal code is legacy.

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
  - Email: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` (Gmail API, works on Railway Hobby). `GMAIL_APP_PASSWORD` is the SMTP fallback, which Railway blocks below the Pro plan.
- If production breaks, first check that the Railway variables above are all present.
