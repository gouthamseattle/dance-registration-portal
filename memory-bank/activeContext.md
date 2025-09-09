# Active Context - Dance Registration Portal

## Current Work Focus

### Recently Completed (This Session)
- ✅ Student portal schedule display fixed to include day, start time, end time, and location
  - Frontend renders slot-based schedule on course cards and in the Selected Course Info panel
  - Fallback to course-level start/end times if a slot is missing time values
  - Dates shown separately (Start Date or Start-End range)
- ✅ Server computes schedule_info from slots so all UIs (including confirmation) receive full schedule text with times and dates
  - schedule_info now derived as: "Fridays 7:00 PM - 8:30 PM at Studio G (9/20/2025 - 11/1/2025)"
  - If only start date provided: "(Starts 9/20/2025)"
- ✅ Cache-busting added to ensure production pulls latest JS (registration.js?v=45ddfb5)
- ✅ Student portal UI improvements (previous UI pass)
  - Removed "saved with ID" technical detail after payment initiation
  - Removed "Available spots" from student-visible UI
  - Crew Practice: changed Instagram ID field to "Full Name"
  - Removed 💰 emoji from total amount display

### Recently Completed (Previous Sessions)
- ✅ Start Date optional in New Dance Series form; backend supports NULL start_date
- ✅ Slot-based course architecture implemented (multi-slot support with per-slot capacity and pricing)
- ✅ Admin dashboard: edit/deactivate fixes and DB boolean normalization (is_active across SQLite/Postgres)
- ✅ Dreamers Dance Crew (DDC) conditional branding mode: header, footer logo, background styling
- ✅ Rebranded student portal to "GouMo Dance Chronicles" with modern theme
- ✅ Removed capacity/spots display from course cards as requested
- ✅ Hide dance experience field for Crew Practice courses

### Current Status
- Project State: Fully functional; schedule now computed server-side and rendered with times on frontend
- Deployment: Live on Railway (auto-deploy from GitHub)
- Databases: PostgreSQL in production, SQLite in development
- Payments: Venmo deep link flow live; PayPal integration code still present (for potential use)
- UI: Bootstrap-based; vanilla JS for dynamic behavior

### Recent Deployment & Commits
- 45ddfb5 — Show slot times on cards and form; add fallback to course-level times; fix duplicate variable declarations
- 75511bb — Compute schedule_info on server from slots (include start/end times and dates) and cache-bust registration.js

## Active Decisions and Considerations

### Technical Decisions Made
1. Server-side derived schedule_info:
   - Decouple frontend display from legacy free-text schedule field
   - Ensure confirmation and any consumer of schedule_info show full time details
2. Frontend uses slot data preferentially:
   - Builds "Day Start - End at Location" lines per slot
   - Appends course dates where available
   - Graceful fallbacks to course-level times when slot times are missing
3. Cache-Busting:
   - Append version query param to registration.js in index.html to avoid stale client caches on deploy
4. DB Boolean Normalization:
   - is_active normalization for SQLite (1/0) vs PostgreSQL (true/false) handled in PUT /api/courses/:id

### Current Architecture Patterns
- Slot-Based Courses:
  - Aggregated capacity across slots; slot-level pricing (full_package, drop_in)
  - schedule_info computed per course from slots and course dates
- Database Abstraction: DatabaseConfig with unified run/get/all, isProduction branching
- Error Handling: asyncHandler wrapper across routes
- Auth: Session-based admin auth with bcrypt password hashing
- Frontend: Vanilla JS; no frameworks; Bootstrap components

## Learnings and Project Insights

### Key Technical Insights
1. Computing schedule_info on the server ensures consistent schedule rendering across all UIs
2. Cache-busting avoids persistent stale script caches in production
3. Cross-DB boolean handling is essential for consistent admin toggles
4. Slot-based architecture should be the single source of truth for schedule and pricing

### User Experience Insights
1. Students should not see technical details (e.g., registration IDs) during payment
2. Clear schedule with explicit times/dates reduces confusion and follow-ups
3. Conditional fields (Crew Practice) keeps forms relevant and shorter

## Next Steps and Priorities

### Immediate
- Validate production display shows the full schedule on:
  - Course cards
  - Selected Course Info in the form
  - Confirmation (via server-computed schedule_info)
- If any gaps remain, inspect slot time data formats and adjust serialization/formatting

### Near-Term Enhancements
- Consider switching confirmation rendering to slot-based details directly if needed (now covered by server-computed schedule_info)
- Capture Venmo transaction notes and tie them to admin confirmation flows as metadata

### Medium-Term
- Email notifications in the registration flow (send confirmation with computed schedule)
- CSV export in admin dashboard
- Expose QR code/WhatsApp sharing from admin with course schedule snippet

## Development Environment Notes
- Local DB: ./database/registrations.db (SQLite)
- Production DB: PostgreSQL via DATABASE_URL
- Admin: admin/admin123 (set during migration)
- Port: 3000

## Testing Patterns
- Deployment-first validation on Railway; hard-refresh to bypass caches
- Verify /api/courses returns schedule_info including times/dates for active courses
