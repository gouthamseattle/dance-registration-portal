# Progress - Dance Registration Portal

## What Works (Completed Features)

### ✅ Core Infrastructure
- Express server with proper middleware and static file serving
- DatabaseConfig abstraction handles SQLite (dev) and PostgreSQL (prod)
- Session management tuned for Railway (secure=false, httpOnly, sameSite=lax)
- Unified async error handling via asyncHandler
- Environment switching and migrations wired for production

### ✅ Student Registration System
- Course listing with capacity computed from slot capacities
- Registration form (mobile-optimized, validated)
- Automatic student create/update on registration
- Overbooking prevention (registration vs capacity checks)
- Mobile-first design and WhatsApp-friendly sharing

### ✅ Payment Processing
- Venmo deep link flow with mobile app handoff and desktop QR code
  - POST /api/generate-venmo-link returns venmoLink, webLink, paymentNote, venmoUsername
  - Desktop QR code generated client-side (api.qrserver.com)
  - “I’ve Sent the Payment” flow and pending confirmation state
- Admin confirm payment endpoint to mark registration as completed
- Payment status tracking persisted in registrations

### ✅ Admin Dashboard
- Secure login with bcrypt password hashing
- Course CRUD with slot-based architecture (multi-slot support)
- Real-time registrations view
- Dashboard stats (registrations, revenue, active courses, pending payments)
- Course types and constraints: crew practice limited to one slot

### ✅ Database Management
- Dual DB support (SQLite dev, Postgres prod)
- Automatic migration on production deploy
- Slot-based schema: course_slots, course_pricing
- Data integrity via FKs and cascade deletes

### ✅ Production Deployment
- Railway auto-deploys on git push
- PostgreSQL managed by Railway
- HTTPS domain for production
- Cache-busting added for client assets to mitigate stale caching
- Build pipeline stabilized: run DB migrations at app start (not during build); removed npm build script; sqlite3 is dev-only and lazy-loaded

### ✅ Security Implementation
- Password hashing (bcryptjs)
- Session security (httpOnly, sameSite)
- Parameterized queries throughout
- Server-side validation

### ✅ Student Portal UX Improvements
- Schedule shows Day + Start-End time + Location across UI
  - Cards: slot-based details with date range appended
  - Selected Course Info: per-slot lines + separate Dates section
  - Confirmation: server-computed schedule_info ensures times/dates
- Removed technical “saved with ID” messaging from payment UI
- Hidden “Available spots” from student-facing UI
- Crew Practice: Instagram ID field changes to “Full Name”; Dance Experience hidden
- Removed 💰 emoji from total amount; cleaner total display
- Cache-busting for registration.js

### ✅ Transactional Emails (New)
- Nodemailer integration with multi-mode transport detection:
  - EMAIL_SERVICE (e.g., gmail), or EMAIL_HOST/EMAIL_PORT, or implicit Gmail fallback with EMAIL_USER/EMAIL_PASSWORD
- Email sender resolution via EMAIL_FROM or NAME + ADDRESS fallback
- Confirmation email automatically sent on admin payment approval:
  - PUT /api/admin/registrations/:id/confirm-payment updates status and sends email (when system setting email_notifications_enabled='true')
  - Email includes courseName, computed schedule_info, amount, registrationId, and studentName
  - Endpoint never fails due to email errors; returns flags: email_sent, email_skipped, email_error
- Resend endpoint: POST /api/admin/registrations/:id/resend-confirmation
- Debug endpoint: GET /api/admin/debug-email-config (no secrets; shows chosen transport, presence of envs)
- EMAIL_DEBUG=true enables safe runtime detection logs

### ✅ Admin UI Reliability (New)
- Loading overlay made non-interactive to avoid intercepting clicks if it remains visible (pointer-events: none)
- Overlay is also hidden in finally blocks and on window load as a safety
- Global handlers exposed on window:
  - window.quickConfirmPayment(regId)
  - window.markPaidModal(regId)
- Click diagnostics added via console.info in global handlers
- Cache-busting bumped for admin assets:
  - admin.html -> js/admin.js?v=5, css/admin-styles.css?v=3

## What Changed Recently (Server + Frontend + Repo)

### Server
- GET /api/courses computes schedule_info from slots + course dates
- Confirm payment flow:
  - PUT /api/admin/registrations/:id/confirm-payment
  - POST /api/admin/registrations/:id/resend-confirmation
  - GET /api/admin/debug-email-config
- Capacity check rewritten with subqueries and numeric coercion

### Frontend
- registration.js/card rendering: slot-based schedule display with time-aware details
- admin.js/admin.html:
  - Global quick confirm and mark-paid handlers wired via window.*
  - Click logging added to global handlers for diagnostics
  - Overlay safety changes
  - Cache-busting for admin.js and admin-styles.css
- Student portal selection flow hardening:
  - Numeric ID matching for courses and drop-ins to avoid string/number mismatch across DB drivers
  - Defensive fetch/JSON parsing with response.ok and status checks
  - Debounce selection clicks (isSelecting / isSelectingDropIn) to prevent races
  - Suppress error toast after successful navigation (only show if not on 'form' step)
  - Refresh course list on back navigation to avoid stale state
  - Robust Instagram/Name field toggle for crew practice
  - Guard errors in showRegistrationForm UI prep (non-blocking)
  - Cache-busted registration.js to v=49

### Repository
- Repository reorganization: moved utility scripts to scripts/, docs/ to docs/, loose media to assets/media/.
- Updated references: server now requires ./scripts/migrate-to-postgres; npm run setup points to scripts/setup.js.
- Fixed SQLite path in scripts/migrate-to-postgres.js; aligned scripts/setup.js to use bcryptjs to match dependencies.

### Commits Deployed
- 45ddfb5 — Show slot times on cards and form; add fallback to course-level times; fix duplicate variable declarations
- 75511bb — Compute schedule_info on server from slots (include start/end times and dates) and cache-bust registration.js
- 43aeef1 — Admin UI: make loading overlay non-interactive; add click logging; bump cache-busters (admin.js v=5, admin-styles.css v=3). Update memory bank with email workflow and UI fixes.
- 0ab7057 — Fix re-selection bug: numeric ID matching, stale data guard, cache-bust registration.js to v=48
- 5e8f249 — Suppress spurious selection error toast; add in-progress guards; robust field toggling; cache-bust to v=49
- 37e19a4 — Build fix: run DB migrations at app start; remove build script; lazy-load sqlite3; move sqlite3 to devDependencies

## Current Status Overview

### 🟢 Fully Operational
- Slot-based course creation and display
- Student registration and Venmo payment initiation
- Admin management and dashboard stats
- Production deployment and auto-deploy flow
- Time-aware schedule visible across UI
- Transactional email on admin payment approval (with resend support and config debug endpoint)
- Admin UI approval buttons responsive; overlay cannot block clicks

### 🟡 Partially Implemented
- CSV export surface in admin UI (core export exists; enhance per-course export UX)

### 🔴 Not Started
- Bulk email interface in Admin
- Advanced analytics/reporting
- Multi-instructor support
- Student self-service dashboard
- Waitlist management

## Known Issues and Limitations

### ⚠️ Current Considerations
1. Email delivery depends on valid SMTP credentials and provider policies; use GET /api/admin/debug-email-config and set EMAIL_DEBUG=true for diagnostics.
2. Drop-in classes endpoint currently returns an empty array (placeholder).

### 🐛 Minor Issues
1. Error UI copy could be improved in some flows
2. Some admin features could be more mobile-friendly
3. Loading indicators could be further enhanced in payment steps

## Evolution of Project Decisions

### Still Valid
- Vanilla JS and Bootstrap for speed and simplicity
- Dual DB abstraction for dev/prod parity
- Railway as deployment target
- Slot-based course as source of truth (schedule/pricing/capacity)

### Evolved Decisions
- Server-computed schedule_info replaces hand-authored schedule text for consistency
- Student payment UX prioritizes Venmo deep link/QR flow
- Cache-busting added to client asset URLs to ensure immediate rollout
- Transactional emails sent on admin approval with resilient error handling and explicit resend

## Success Metrics Achieved

### ✅ Technical
- Mobile load performance sustained
- Reliable deployment pipeline via git push
- Consistent, time-aware schedule rendering across views
- Transactional emails integrated and configurable

### ✅ UX
- Clear schedule presentation
- Cleaner payment UI without technical noise
- Reliable admin approval actions with helpful toasts

### ✅ Business
- Professional student-facing presentation
- Fewer schedule-related student questions
- Post-payment confirmations emailed on approval

## Next Development Priorities

### High Priority (Next Sprint)
1. CSV Export UX: Enhance admin export options (per-course, filtered)
2. Admin diagnostics UI for email config (optional surface for /api/admin/debug-email-config)

### Medium Priority
1. Bulk Email Interface in Admin
2. Enhanced Reporting: Basic analytics views
3. Improve error and loading states further

### Low Priority
1. Multi-instructor support and roles
2. Student dashboard and receipt downloads
3. Calendar integrations
