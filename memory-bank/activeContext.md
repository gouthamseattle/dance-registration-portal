# Active Context

## Current Focus: Choreography & Dance Series Feature (Resumed)

### Status Update (March 1, 2026 - 11:31 PM)
- ✅ **Code Modularization**: Successfully completed and deployed
  - Fixed production deployment bug in database initialization
  - Admin portal confirmed working
- 🔄 **Resuming Choreography Feature**: Back to implementing dance series functionality

### Choreography Feature Overview
**Goal**: Add choreography course type with flexible series packaging
- **Choreography Batches**: 2-class courses with song/movie/language metadata
- **Series Packaging**: Bundle up to 3 choreographies into Slot 1 or Slot 2 packages
- **Registration Options**: Single batch, multiple batches, slot packages, or combined packages
- **Capacity Logic**: Reserve-on-pending for choreography (different from existing courses)

### Implementation Status Check Needed
Before proceeding, need to verify what's already implemented:
1. **Database Schema** - Check if choreography columns and series tables exist
2. **Backend APIs** - Verify which admin/student endpoints are already built
3. **Frontend UI** - Assess current state of admin and student interfaces

### Known Schema Components (from database/initialize.js)
- ✅ Choreography columns on courses table: `song_name`, `movie_name`, `language`, `series_slot`
- ✅ Dance series tables: `dance_series`, `dance_series_courses`
- ✅ Schema initialization functions already present

### Next Immediate Steps
1. Verify current implementation status in server.js (API endpoints)
2. Check admin.html/admin.js for series management UI
3. Check student portal for choreography display
4. Identify gaps and prioritize remaining work

## Technical Decisions (Choreography Feature)

### Database Design
- **courses table**: Added choreography-specific columns without breaking existing courses
- **dance_series table**: Stores series metadata and pricing for slot packages
- **dance_series_courses table**: Junction table linking series to courses with slot/position
- **Backward Compatible**: No changes to existing course types or registrations

### Capacity Management
- **Choreography**: Reserve slots on pending payment (count both pending + completed)
- **Existing Courses**: Continue using completed-only logic
- **Implementation**: Uses `course_type` field to determine counting logic

### API Strategy
- **Admin Series CRUD**: Dedicated endpoints for series management
- **Student Registration**: New endpoints for choreography-specific flows
- **Isolation**: New logic doesn't interfere with existing registration flows

## Recent Code Modularization (Completed March 1, 2026)

### Achievements
- Created `database/initialize.js` - Database setup and migrations (400+ lines)
- Created `middleware/auth.js` - Authentication helpers (~50 lines)
- Created `utils/courseAvailability.js` - Capacity logic (~100 lines)
- Moved 6 one-time scripts to `scripts/archive/` with README
- Reduced server.js from 6000+ to ~4500 lines
- Fixed production deployment bug
- Successfully deployed to Railway

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

## Current System State

### Working Systems
- ✅ Admin portal operational in production
- ✅ Student registration flows functional
- ✅ Database initialization with schema migrations
- ✅ Modular codebase structure
- ✅ Email confirmations active

### Choreography Feature Progress (Updated March 1, 2026 - 11:42 PM)
- ✅ **Admin UI for Choreography Creation** - Complete and validated in production
  - Form fields: song_name, movie_name, language, series_slot
  - Show/hide logic based on course type
  - Save and edit functionality working
  - User confirmed: "I was able to create and save it"
- ⏳ **Series Management UI** - Next priority
  - Create/manage slot packages (bundle 3 choreographies)
  - Assign choreographies to slots
  - Set package pricing
- ⏳ **Student Registration UI** - After series management
  - Display choreography metadata (song, movie, language)
  - Show series package options
  - Handle choreography-specific registration flow
- ⏳ **Testing & Validation**
  - Test series package creation
  - Test student registration for choreography
  - Validate capacity logic for reserve-on-pending
