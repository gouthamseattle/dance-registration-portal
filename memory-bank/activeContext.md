# Active Context - Dance Registration Portal

## Current Work Focus

### Recently Completed (This Session)
- ✅ Repository reorganization: moved utility scripts to scripts/, docs to docs/, loose media to assets/media; updated server.js and package.json accordingly
- ✅ Railway build fix: run DB migrations at app start; removed NPM build script; lazy-loaded sqlite3 for dev only; moved sqlite3 to devDependencies; pushed to Railway to trigger deploy
- ✅ Admin payment approval flow finalized with confirmation email
  - Server PUT /api/admin/registrations/:id/confirm-payment marks payment as completed and sends confirmation email via Nodemailer when email_notifications_enabled is true
  - Email payload includes: courseName, computed schedule_info, amount, registrationId, studentName
  - Errors in email sending never fail payment update; endpoint returns flags: email_sent, email_skipped, email_error
  - Admin resend endpoint added: POST /api/admin/registrations/:id/resend-confirmation (requireAuth)
  - Admin debug endpoint added: GET /api/admin/debug-email-config to inspect transport detection (no secrets)
- ✅ Admin UI fixes for unclickable approval buttons
  - Loading overlay made non-interactive with CSS: pointer-events: none to prevent click interception if overlay persists
  - Global handlers already existed (window.quickConfirmPayment and window.markPaidModal); now instrumented with console.info logs for click diagnostics
  - admin.js and CSS cache-busting updated in admin.html to ensure latest assets load in production (js/admin.js?v=5, css/admin-styles.css?v=3)
  - Safety hides overlay on window load and in finally blocks after initial data load

### Recently Completed (Previous Sessions)
- ✅ Student portal schedule display enhancement (slot-based, time-aware)
- ✅ Server computes schedule_info from slots (consistent across UIs)
- ✅ Cache-busting for registration.js
- ✅ DB boolean normalization and admin toggles
- ✅ Slot-based course architecture with per-slot pricing and capacity
- ✅ DDC branding/theme and student portal UX cleanups

## Current Status
- Email stack: Nodemailer integrated with multi-mode configuration
  - Supports EMAIL_SERVICE (e.g., gmail), or EMAIL_HOST/EMAIL_PORT, or implicit Gmail fallback when only EMAIL_USER/EMAIL_PASSWORD are present
  - EMAIL_DEBUG logging available; buildFromAddress supports EMAIL_FROM or NAME + ADDRESS fallback
- Admin UI: Buttons for payment confirmation are wired through global fallbacks and should be clickable even if class init fails
- Deployment: Railway auto-deploy on git push; environment variables configured in Railway (EMAIL_*)

## Architecture and Patterns (Relevant)
- Slot-Based Courses: source of truth for schedule_info and pricing
- Server routes:
  - PUT /api/admin/registrations/:id/confirm-payment updates status and sends email
  - POST /api/admin/registrations/:id/resend-confirmation resends email
  - GET /api/admin/debug-email-config exposes detected email transport configuration (no secrets)
- Utilities:
  - utils/mailer.js: transport detection, debug logging, sendRegistrationConfirmationEmail()
  - utils/schedule.js: fetchCourseWithSlots() computing schedule_info to match GET /api/courses

## Root Cause Addressed
- Unclickable admin buttons likely caused by a persistent loading overlay intercepting pointer events and/or stale cached JS
  - Fixes: overlay pointer-events: none; cache-busted assets; added explicit window load overlay hide

## Next Steps and Priorities
- Immediate
  - Validate production after latest deployment (build fix applied):
    - Admin UI loads js/admin.js?v=5 and css/admin-styles.css?v=3 (Network tab)
    - Clicking “Quick Confirm Payment” logs console.info and triggers backend, returning email flags
    - Emails are sent when email_notifications_enabled is true; check server logs for ✉️ Sent or any errors
- Near-Term
  - Add UI surface to show /api/admin/debug-email-config JSON in a small modal for quicker diagnostics (optional)
  - Consider storing confirmation_sent_at timestamp in registrations (optional)
- Medium-Term
  - CSV export enhancements and per-course export improvements
  - Bulk communications and additional admin productivity tooling

## Development Notes
- Ensure Railway Env Vars: EMAIL_SERVICE or EMAIL_HOST/EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD or EMAIL_PASS, optional EMAIL_FROM/EMAIL_FROM_NAME/EMAIL_FROM_ADDRESS, optional REPLY_TO and ADMIN_BCC, EMAIL_DEBUG=true for verbose logs
- Confirm system_settings includes email_notifications_enabled='true' to enable sending

## Testing/Validation Plan
- On production admin:
  - Hard refresh or open incognito
  - Confirm latest assets (v=5 JS, v=3 CSS)
  - Use Quick Confirm on a pending registration and watch toasts:
    - “Payment confirmed. Confirmation email sent.” when email_sent
    - “… email notifications are disabled.” when email_skipped
    - “… email could not be sent: …” on email_error
  - Verify emails received; check Railway logs for debugging output


---

## Recently Completed (Addendum) — Student Portal Selection Flow Fix (Sept 2025)
- ✅ Fixed “Failed to select course” error appearing even when navigation succeeded
  - Implemented type-safe ID matching in selection:
    - Match by numeric ID: Number(c.id) === Number(courseId) for both courses and drop-ins to avoid string/number mismatches across DB drivers (SQLite/Postgres).
  - Defensive fetch and JSON handling:
    - Checked response.ok and captured response.status.
    - Guarded JSON parsing with try/catch; logged parsing errors without breaking the flow.
  - Suppressed spurious error toast after successful navigation:
    - In selectCourse/selectDropIn, only show the error toast if currentStep !== 'form', preventing a misleading “Failed to select course” when the form has already rendered.
  - Debounced rapid clicks/race conditions:
    - Added isSelecting and isSelectingDropIn flags to ignore overlapping clicks during selection requests.
  - Back-navigation stale-state guard:
    - showCourseSelection now clears prior selection and calls loadCourses() to refresh data when returning to the courses list.
  - Robust field toggling for crew practice:
    - setupInstagramIdField now tolerates prior toggles, finding either #instagram_id or #student_name, updating the label and field safely without DOM errors.
  - Error isolation in UI preparation:
    - Wrapped registration form preparation calls in try/catch within showRegistrationForm() so failures in non-critical UI setup don’t surface as selection errors.
  - Cache-busting:
    - public/index.html updated to load js/registration.js?v=49 to ensure fresh code in production.

### Files Touched
- public/js/registration.js
  - Selection flow hardening, toast suppression, debouncing flags, robust field toggle, guarded UI prep, type coercion for IDs.
- public/index.html
  - Cache-busted registration.js to v=49.

### Commits Deployed
- 0ab7057 — Fix re-selection bug: numeric ID matching, stale data guard, cache-bust to v=48
- 5e8f249 — Suppress spurious selection error toast; add in-progress guards; robust field toggling; cache-bust to v=49

### Production Validation Plan (Student Portal)
1. Hard refresh or open in incognito to ensure js/registration.js?v=49 is loaded (verify in Network tab).
2. Click “Register Now” on a course to navigate to the form. Then click “Back to Courses” and click the same course again (optionally a different course).
   - Expected: No “Failed to select course” toast after navigation; form renders; console shows “Selecting course…” and “Course selected …”.
3. If admin reset actions were performed, repeat step 2; the refreshed list prevents stale data mismatches.
4. Observe console for any API or parsing logs; they should not prevent successful navigation.

---

## Post-First-Class Feedback (Admin Portal) — Sept 2025
- Duplicate registrations observed for the same course with the same displayed ID
- Status filter not working on registrations page
- "Failed to export registrations" error when clicking Export All
- Dance Series filter not working
- Some registrations still show pending even after confirmation
- Need registration ID shown prominently across Admin UI (tables, detail modals, confirmation dialogs, CSV export)

## Clarified Requirements
- Attendance tracking:
  - Track both per-session attendance and overall series completion
  - Attendance is for records only (does not affect payment status)
  - Mobile-friendly interface for marking during class
- Series cleanup:
  - Move finished series to a "Completed Series" section (archive, do not delete)
- Reporting dashboard:
  - Refresh on navigation to the page (no real-time push needed)
  - Checkbox-based selection for bulk operations

## Implementation Plan (Phased)
1) Phase 1: Critical Fixes
   - Investigate duplicate registration issue (same ID display) and prevent duplicates
   - Fix Status and Series filters in admin UI
   - Repair CSV Export (server route + client trigger)
   - Ensure payment confirmation clears stale "pending" in the UI/model
   - Add Registration ID prominently across Admin UI and CSV

2) Phase 2: Reporting & Bulk Operations
   - APIs for analytics (counts/lists by series and status)
   - Admin reporting dashboard with on-demand refresh
   - Checkbox-based bulk edit/delete actions
   - Series archival (move to Completed)

3) Phase 3: Attendance Tracking
   - Schema: class_sessions (per-date), attendance_records (per-student per-session)
   - API endpoints for attendance CRUD
   - Mobile-first attendance UI and summary reports (per-session and % series completion)

4) Phase 4: Enhanced Admin Experience
   - Completed Series management surface
   - Bulk communications, additional quality-of-life improvements

5) Phase 5: Testing & Validation
   - Validate duplicate-prevention and filter/export fixes with real data
   - Verify reporting accuracy and attendance workflow
   - UAT in production deployment

---

### Phase 1 — Critical Fixes Implemented (Sept 2025)
- Server
  - Added CSV export endpoint: `GET /api/admin/registrations/export?course_id=&payment_status=` that:
    - Applies filters server-side (course_id, payment_status)
    - Generates a properly escaped CSV (quotes/commas/newlines) with headers and ISO date-based filename
  - Added de-duplication guard in `POST /api/register`:
    - If a completed registration already exists for (student, course) → block with error
    - If a pending registration exists → return that registration ID instead of creating a duplicate (idempotent)
- Admin UI
  - Display Registration ID across UI:
    - Recent Registrations table now shows ID
    - Registrations table includes ID as the first column
    - Registration Details modal shows “Registration ID”
  - Fixed Registrations “Dance Series” filter with type-safe comparison: `Number(r.course_id) === Number(filter)`
  - “Export Data/Export All” now opens server CSV export and preserves current filters
  - Cache-busted admin assets: `admin.js?v=12`
- Files Touched
  - `public/js/admin.js` (ID columns, filter fix, export wiring, modal details)
  - `public/admin.html` (cache-bust to v=12)
  - `server.js` (CSV export route, registration de-duplication)
- Deployment Plan
  - Commit and push to `main` to trigger Railway deploy; validate CSV export, filters, and de-dup workflow in production

### Validation Plan (Post-Deploy)
1. Hard refresh admin, confirm `js/admin.js?v=12` loads.
2. On Registrations:
   - Set Course and Status filters; click “Export All” → CSV downloads with matching rows.
   - Approve a pending registration → row status updates to completed on refresh.
3. Attempt duplicate registration with same student email and same course:
   - If one completed exists → server returns error.
   - If one pending exists → server returns existing `registrationId` with `deduped: true`.
