# Active Context

## Current Focus: Choreography Packages on Student Portal (Completed March 3, 2026)

### What Was Done
- **Problem**: Student registration portal displayed individual choreography courses as separate cards (Face Card, Sajni Re, AA23 Theme @ $25 each). Admin had created choreography packages via admin dashboard but student portal wasn't fetching/displaying them.
- **Solution Implemented**:
  1. Created public `GET /api/dance-series` endpoint (no auth) returning active packages with courses, pricing, schedule info, savings calculations
  2. Filtered choreography courses (`course_type = 'choreography'`) from `GET /api/courses` so they no longer appear as individual cards
  3. Added "Choreography Batches" section to `index.html` with 4-step interactive flow
  4. Added full choreography selection flow to `registration.js`:
     - Step 1: Track selection cards (Slot 1, Slot 2, Both Slots)
     - Step 2: Best Value package cards with auto-select, savings display, and click-to-toggle
     - Step 3: Individual choreography checkboxes with song/movie/language metadata and prices
     - Step 4: Live pricing summary with "Continue to Registration" button
  5. Registration proceeds with synthetic course object carrying package/selection metadata
- **Key files changed**: `server.js`, `public/index.html`, `public/js/registration.js`
- **Deployed**: Pushed to main, Railway deployment triggered

### Previous Admin-Side Fixes (Same Session)
- Fixed server-side data format mismatch for choreography package save/display in admin dashboard
- Added missing `case 'packages'` in admin.js `showSection()` switch

## Choreography Feature - Full Status

### Completed Components
- ✅ **Database Schema**: `dance_series`, `dance_series_courses` tables with choreography columns on `courses`
- ✅ **Admin Choreography Creation**: Form with song/movie/language/series_slot fields
- ✅ **Admin Series/Package Management**: CRUD endpoints + UI (packages tab)
- ✅ **Admin Package Save/Display**: Fixed format mismatch bug + missing navigation handler
- ✅ **Public API**: `GET /api/dance-series` endpoint for student portal
- ✅ **Student Portal Display**: Packages shown as interactive track → package → checkbox → summary flow
- ✅ **Choreography Filtering**: Individual choreography courses hidden from `/api/courses`

### Architecture Decisions
- **Public endpoint**: `/api/dance-series` returns packages + all choreography courses (no auth needed)
- **Filtering**: Choreography courses excluded from `/api/courses` via `course_type != 'choreography'` condition
- **Registration flow**: Synthetic course object created from package/individual selections, carries `_choreo_package`, `_choreo_course_ids`, `_choreo_total` metadata
- **CSS**: Injected dynamically via `injectChoreographyStyles()` at app init

## Current System State

### Working Systems
- ✅ Admin portal operational in production
- ✅ Student registration flows functional (multi-week, drop-in, crew practice, choreography packages)
- ✅ Database initialization with schema migrations
- ✅ Modular codebase structure
- ✅ Email confirmations active
- ✅ Choreography packages displayed on student portal

### Module Structure
```
database/
  initialize.js     # DB setup, migrations, schema updates
middleware/
  auth.js          # asyncHandler, requireAuth helpers
utils/
  courseAvailability.js  # Capacity calculation logic
  mailer.js        # Email utilities
  schedule.js      # Schedule helpers
scripts/
  archive/         # Historical one-time scripts with README
```
