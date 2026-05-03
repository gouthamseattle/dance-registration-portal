# Active Context

## Current Focus: Competition Registration Feature (May 2026)

### What Was Done (May 3, 2026)

#### Production Server Crash Fix
- **Problem**: Server was down — admin portal returned "Internal server error", student portal showed "Registration closed"
- **Root Cause**: `NODE_ENV` environment variable was missing from Railway dashboard variables. Without it, `dbConfig.isProduction` was `false`, causing the server to use SQLite instead of PostgreSQL. Since the Railway container has no SQLite database file, all queries failed with "no such table: admin_users"
- **Immediate Fix**: User added `NODE_ENV=production` in Railway dashboard → server came back up
- **Preventive Code Fix**: Updated `database-config.js` to auto-detect PostgreSQL:
  ```javascript
  this.isProduction = process.env.NODE_ENV === 'production' || !!process.env.DATABASE_URL;
  ```
  Now even if `NODE_ENV` gets cleared, the presence of `DATABASE_URL` will trigger PostgreSQL mode
- **Additional**: Added startup diagnostic logging showing NODE_ENV, DATABASE_URL status, and isProduction flag
- **DB Retry Logic**: Added 5-attempt retry with 3s delay in `database/initialize.js` to handle transient connection failures

#### Competition Registration UI Updates
- **Card features updated**: Both Solo and Duo/Trio category cards now display:
  - 2–3 MIN (stopwatch icon)
  - ANY STYLE (music icon)  
  - ANY LANGUAGE (globe icon)
  - Removed "PERFORMANCE", "WELCOME" sub-labels from all feature icons

### Competition Feature — Current State

#### Completed Components
- ✅ **Database Schema**: `competition_registrations` table with solo/duo_trio categories
- ✅ **Backend API Endpoints**:
  - `POST /api/competition/register` — Create registration
  - `POST /api/competition/generate-venmo-link` — Venmo payment
  - `POST /api/competition/generate-zelle-payment` — Zelle payment
  - `POST /api/competition/confirm-payment-submitted` — User confirms payment
  - `GET /api/admin/competition/registrations` — Admin view (with filters)
  - `PUT /api/admin/competition/registrations/:id/confirm-payment` — Admin confirms
  - `PUT /api/admin/competition/registrations/:id/cancel` — Admin cancels
  - `PUT /api/admin/competition/registrations/:id/uncancel` — Admin uncancels
  - `GET /api/admin/competition/registrations/export` — CSV export
- ✅ **Student Portal UI**: Competition section in `email-profile.html` with:
  - Banner, event details, collapsible rules
  - Premium category cards (Solo $30, Duo/Trio $60-$90)
  - Solo form (name, email, Instagram, contact)
  - Duo/Trio form (team name, 2-3 member names, POC email/contact)
  - Payment flow (Venmo/Zelle) with confirmation
- ✅ **Admin Portal**: Competition registrations tab with filters, confirm/cancel, CSV export
- ✅ **Competition section visibility**: Controlled by `competition_registration_open` system setting

#### Architecture Decisions
- Separate `competition_registrations` table (not reusing `registrations`)
- $30 per person pricing — solo=$30, duo=$60, trio=$90
- Competition section shows alongside regular class registration
- System setting `competition_registration_open` controls visibility

### Previous Work: Choreography Packages (Completed March 2026)
- Public `GET /api/dance-series` endpoint for student portal
- Choreography courses filtered from `/api/courses` 
- 4-step interactive selection flow on student portal
- Admin series/package management CRUD

## Current System State

### Working Systems
- ✅ Admin portal operational in production
- ✅ Student registration flows functional (multi-week, drop-in, crew practice, choreography packages)
- ✅ Competition registration (Solo + Duo/Trio) with payment flow
- ✅ Database initialization with schema migrations + retry logic
- ✅ Modular codebase structure
- ✅ Email confirmations active
- ✅ DATABASE_URL auto-detection prevents SQLite fallback in production

### Module Structure
```
database/
  initialize.js     # DB setup, migrations, schema updates (with retry logic)
database-config.js  # DB abstraction (auto-detects PostgreSQL from DATABASE_URL)
middleware/
  auth.js          # asyncHandler, requireAuth helpers
utils/
  courseAvailability.js  # Capacity calculation logic
  mailer.js        # Email utilities
  schedule.js      # Schedule helpers
scripts/
  archive/         # Historical one-time scripts with README
```

### Key Files for Competition Feature
- `public/email-profile.html` — Competition UI (cards, forms, payment)
- `public/js/email-profile-registration.js` — Competition JS logic
- `server.js` — Competition API endpoints
- `database/initialize.js` — `competition_registrations` table schema
- `public/css/styles.css` — Competition CSS styles
