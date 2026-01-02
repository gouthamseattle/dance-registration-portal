# System Patterns - Dance Registration Portal

## Architecture Overview

### Application Structure
```
dance-registration-portal/
├── server.js                 # Main Express server
├── database-config.js        # Database abstraction layer
├── scripts/                  # Utility scripts and maintenance tasks
│   ├── migrate-to-postgres.js    # Production migration script
│   ├── migrate-slots-schema.js   # Slot schema migration helper
│   ├── setup.js                  # Local setup/bootstrap
│   ├── clear-courses.js          # Admin maintenance script
│   └── create-admin.js           # Admin user creation utility
├── public/                  # Static frontend files
│   ├── index.html          # Student registration portal
│   ├── admin.html          # Admin dashboard
│   ├── css/               # Stylesheets
│   └── js/                # Client-side JavaScript
├── assets/
│   └── media/             # Loose media assets (not part of app)
├── docs/                  # Project documentation
└── database/              # SQLite database (development)
```

### Database Design Patterns

#### Multi-Database Support
- **Development**: SQLite for local development
- **Production**: PostgreSQL for Railway deployment
- **Abstraction**: DatabaseConfig class handles both databases transparently

#### Key Tables Structure
```sql
-- Core entities
students (id, first_name, last_name, email, phone, ...)
courses (id, name, description, course_type, duration_weeks, start_date, end_date, instructor, schedule_info, prerequisites, is_active, ...)
registrations (id, student_id, course_id, payment_status, payment_amount, paypal_transaction_id, payment_method, registration_date, ...)
admin_users (id, username, password_hash, email, last_login, ...)
system_settings (setting_key, setting_value, description, updated_at, ...)

-- Slot-based scheduling and pricing
course_slots (id, course_id, slot_name, difficulty_level, capacity, day_of_week, start_time, end_time, location, created_at)
course_pricing (id, course_slot_id, pricing_type, price, created_at)
```

#### Data Relationships
- Students → Registrations (1:many)
- Courses → Registrations (1:many)
- Registrations track payment status and link students to courses

## Key Technical Decisions

### Database Abstraction Pattern
```javascript
class DatabaseConfig {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        // Automatically selects SQLite or PostgreSQL
    }
    
    async connect() {
        return this.isProduction ? this.connectPostgres() : this.connectSQLite();
    }
}
```

**Rationale**: Enables seamless development-to-production workflow without code changes.

### Session Management
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET || 'dance-registration-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,  // Railway deployment compatibility
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));
```

**Rationale**: Secure admin authentication with Railway deployment compatibility.

### Error Handling Pattern
```javascript
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
```

**Rationale**: Consistent async error handling across all routes.

## Design Patterns in Use

### Repository Pattern (Database Layer)
- DatabaseConfig class abstracts database operations
- Consistent API regardless of underlying database
- Simplified testing and development

### MVC-like Structure
- **Models**: Database schema and operations
- **Views**: Static HTML/CSS/JS files
- **Controllers**: Express route handlers

### Configuration Pattern
- Environment-based configuration
- System settings stored in database
- Runtime configuration updates via admin panel

## Schedule Computation Pattern

### Server-computed schedule_info
- The GET /api/courses endpoint now computes schedule_info on the server from slot data.
- Format example: "Fridays 7:00 PM - 8:30 PM at Studio G (9/20/2025 - 11/1/2025)"
  - If only start_date is present: "(Starts 9/20/2025)"
- Ensures consistent schedule rendering across all UIs (cards, form, confirmation) even if legacy free-text schedule fields are empty.

### Slots-first source of truth
- Frontend (registration.js) prefers slot data to build schedule lines:
  - "DayOfWeek Start - End at Location" per slot, with difficulty level appended when multiple slots exist.
  - Appends course date range separately.
- Graceful fallback to course-level start/end time if slot times are missing.

### Backward compatibility fields in /api/courses response
- capacity: Sum of slot capacities
- available_spots: Sum of per-slot availability
- full_course_price / per_class_price: Derived from first slot’s pricing for compatibility with older UI
- schedule_info: Computed string ensuring time-rich schedule text

### Cache-busting for client assets
- index.html references registration.js with a version query param (e.g., registration.js?v=45ddfb5) to avoid stale caches post-deploy.
- Latest increment: registration.js?v=49 (selection flow hardening and toast suppression rollout)

## Frontend UI Guard Patterns (Sept 2025)
- Type-safe ID matching for selections (Number(...) coercion) to handle cross-DB type variance (SQLite integers vs Postgres numeric/strings).
- Debounced selection actions with in-progress flags (isSelecting / isSelectingDropIn) to prevent race conditions from rapid taps/clicks.
- Suppress error toasts after successful navigation (only show toast if not on 'form' step) to avoid misleading “Failed to select course” when UI already transitioned.
- Back-navigation refresh: showCourseSelection() clears any prior selection and re-calls loadCourses() to avoid stale client state after server-side changes (e.g., admin resets).
- Robust DOM toggling for crew practice field (Instagram ID ↔ Full Name) resilient to prior toggles; finds either #instagram_id or #student_name and updates associated label.
- Error isolation during registration form prep (populateSelectedCourseInfo, setupPaymentOptions, etc.) wrapped in try/catch so non-critical UI prep never blocks navigation.

## Component Relationships

### Frontend Architecture
```
Student Portal (index.html)
├── Course Display Component
├── Registration Form Component
└── PayPal Integration Component

Admin Dashboard (admin.html)
├── Authentication Component
├── Course Management Component
├── Registration Monitoring Component
└── Settings Management Component
```

### API Structure
```
/api/
├── admin/           # Admin authentication
├── courses/         # Course CRUD operations
├── register/        # Student registration
├── registrations/   # Registration management
├── settings/        # System configuration
└── dashboard/       # Analytics and stats
```

## Critical Implementation Paths

### Student Registration Flow
1. **Course Selection**: GET /api/courses?active_only=true
2. **Registration**: POST /api/register (creates student + registration)
3. **Payment**: PayPal SDK handles payment processing
4. **Confirmation**: PUT /api/registrations/:id/payment (updates status)

### Admin Course Management
1. **Authentication**: POST /api/admin/login
2. **Course Creation**: POST /api/courses
3. **Monitoring**: GET /api/dashboard/stats
4. **Student Management**: GET /api/registrations

### Database Migration (Production)
1. **Automatic**: Runs on Railway deployment
2. **Schema Creation**: Creates all tables if not exist
3. **Data Migration**: Transfers from SQLite if present
4. **Admin Setup**: Creates default admin user

## Security Patterns

### Authentication
- bcryptjs for password hashing
- Session-based admin authentication
- Protected admin routes with requireAuth middleware

### Data Validation
- Server-side validation for all inputs
- SQL injection prevention via parameterized queries
- XSS protection through proper data handling

### Payment Security
- PayPal SDK handles all payment processing
- Dual payment method support (Venmo + Zelle):
  - Venmo: Deep link generation with QR codes for desktop
  - Zelle: Phone-based recipient configuration with step-by-step instructions
- Payment method tracking: `payment_method` column stores "venmo" or "zelle"
- No sensitive payment data stored locally
- Transaction IDs stored for reference only
- Zelle configuration updates via system settings (recipient name, phone)

## Performance Considerations

### Database Optimization
- Indexed foreign keys for fast joins
- Efficient queries with proper WHERE clauses
- Connection pooling for production PostgreSQL

### Frontend Optimization
- Minimal JavaScript dependencies
- Mobile-first responsive design
- Fast loading for mobile networks

### Caching Strategy
- Static file caching via Express
- Database query optimization
- Session storage for admin state

## New Architecture Additions (Sept 2025)

### Admin Registrations Management Enhancements (2025-09-18)
- Implemented and deployed admin-side Cancel/Uncancel/Edit for registrations.
- Endpoints (requireAuth):
  - PUT /api/admin/registrations/:id/cancel  Body: { reason?: string }
  - PUT /api/admin/registrations/:id/uncancel
  - PUT /api/admin/registrations/:id/edit    Body: { first_name?, last_name?, email?, phone?, payment_amount? }
- Database:
  - registrations: added audit columns canceled_at, canceled_by, cancellation_reason
  - payment_status now includes 'canceled' (used for UI and reporting)
- Emails:
  - sendRegistrationCancellationEmail via SendGrid when system setting email_notifications_enabled = true
- Frontend (Admin):
  - Registrations table actions: View, Edit, Cancel (or Uncancel when already canceled)
  - Status filter includes "Canceled"
  - Status badge style: .status-canceled for clear visual indication
  - Cache-busting bump: admin-styles.css?v=10 and admin.js?v=19

### Email-First Registration System (2025-09-18)
- **Pattern**: Email → Profile Recognition → Pre-populated Registration → Course Access Filtering
- **Student Profile Integration**:
  - `POST /api/check-student-profile` - Email-based student lookup
  - `POST /api/create-student-profile` - New student profile creation  
  - Automatic profile data injection into registration forms via hidden fields
- **Field Consistency Pattern**:
  - Unified field naming: `instagram_handle` across all systems (email-profile, registration, database)
  - Data validation: Smart null/empty detection with helpful error messages
  - Crew practice exception handling: Name field instead of Instagram, no experience required
- **DOM Defensive Programming**:
  - All DOM access wrapped in null checks to prevent TypeError crashes
  - Cross-page compatibility: Registration.js works on both index.html and email-profile.html  
  - Graceful degradation: UI setup errors don't block core navigation

### Course Access Control & Debug System (2025-09-18)
- **Access Control Pattern**:
  - Course filtering by `required_student_type` vs student `student_type`
  - Admin bypass: Admins can register for any course regardless of restrictions
  - Student restrictions: `'general'` students blocked from `'crew_member'` courses
- **Debug Endpoints**:
  - `/api/admin/debug/course-capacity/:courseId` - Detailed capacity vs registration analysis
  - `/api/admin/debug/course-access/:courseId` - Access control configuration diagnosis
  - Root cause identification: Distinguish capacity issues from access control blocks
- **Issue Resolution Pattern**:
  - "Course Full" error often means access restricted, not capacity reached
  - Debug tools provide actionable recommendations for fixing access configuration

### Student Profile & Data Validation Patterns
- **Profile Data Integration**:
  ```javascript
  // Hidden field population from existing profile
  const studentId = document.getElementById('studentId')?.value;
  const preFilledEmail = document.getElementById('studentEmail')?.value;
  
  // Smart validation with null/empty detection
  const hasInstagram = this.registrationData.instagram_handle && 
                        this.registrationData.instagram_handle !== 'null';
  ```
- **Field Name Consistency**:
  - Registration form: `instagram_handle` field name
  - Database: `instagram_handle` column
  - Hidden fields: `studentInstagram` → `instagram_handle` mapping
- **Error Handling**: Comprehensive validation with user-friendly messages for incomplete profiles

### Attendance Tracking
- Goal: Track both per-session attendance and overall series completion; mobile-friendly marking during class; does not affect payments.
- Tables:
  - class_sessions (id, course_id, session_date, start_time, end_time, location, notes, created_at)
  - attendance_records (id, session_id, student_id, status CHECK IN ('present','absent','late'), marked_at, marked_by)
- Derivations:
  - Series completion % per student = present sessions / total sessions for the course (computed on-demand; optional cache column for reporting)
- API:
  - POST /api/admin/courses/:courseId/sessions (create session)
  - GET /api/admin/courses/:courseId/sessions (list sessions)
  - POST /api/admin/sessions/:sessionId/attendance (bulk mark attendance)
  - GET /api/admin/courses/:courseId/attendance/summary (series-level stats)

### Reporting and Bulk Operations
- Analytics Endpoints:
  - GET /api/admin/analytics/registrations-by-series (counts + lists)
  - GET /api/admin/analytics/registrations-by-status (counts + lists)
- Bulk Operations (checkbox selection in UI):
  - POST /api/admin/registrations/bulk-update (status, fields)
  - POST /api/admin/registrations/bulk-delete
- Series Archival:
  - POST /api/admin/series/:id/archive (moves to Completed Series view)
  - GET /api/admin/series/completed (list archived)
  - Archival is non-destructive; data retained for reporting.

### Admin UI Enhancements
- Registrations Page:
  - Add Registration ID as first column; show in modals and confirmation dialogs; include in CSV export.
  - Fix Status and Series filters (ensure filter predicate and option population match API data).
- Reporting Dashboard:
  - Loads analytics on navigation (no realtime push); checkbox-driven bulk actions.
- Attendance UI:
  - Mobile-first session list and student checklist for marking present/absent/late.

### Data Integrity and Audit
- Ensure unique primary keys for registrations; verify no insert path reuses IDs.
- Consider UNIQUE(student_id, course_id) on completed payments if business rules require single active registration per course.
- Optional audit trail for bulk operations (admin_user_id, action, payload, timestamp) to support reversibility.

---

## Attendance UI Visibility Patterns (Sept 2025)

### Roster Source and Filtering
- Data source: `GET /api/admin/registrations?course_id=&payment_status=completed`
- Pattern: load roster as paid-only at the data layer to avoid client-side filtering discrepancies.

### Session Selection UX
- After loading sessions (`GET /api/admin/courses/:courseId/sessions`), auto-select the first session if none is selected so the Students panel always renders individual radios by default.
- Future heuristic (planned): default to nearest upcoming or most recent past session.

### Student Marking Controls
- Individual radios per student with namespacing by student_id:
  - `name="att_status_${student_id}" value="present|late|absent"`
- Bulk operations: All Present / All Late / All Absent / Clear
- Save action performs bulk upsert via `POST /api/admin/sessions/:sessionId/attendance`

### Visibility Hardening (Light/Dark)
- Gridlines: 2px borders on table headers/cells to prevent blending with white backgrounds.
- Column tint: subtle background color for radio columns to make unchecked radios stand out.
- Zebra striping: alternating row colors for readability on light backgrounds.
- Radio design:
  - Larger 20px radios, thick dark borders, custom checked inner dot
  - Scoped styles under `#attendanceStudents` to avoid unintended global overrides
  - Focus/hover states for accessibility and clarity
- Headers and text:
  - Explicit header backgrounds; high-contrast text for names and column titles
- Dark mode:
  - Media-query overrides for borders, background tints, and checked dot color (success green) for visibility.

### Cache Busting and Staleness Prevention
- `public/admin.html` references:
  - `css/admin-styles.css?v=10`
  - `js/admin.js?v=19`
- Pattern: bump version query params when making CSS/JS changes that affect production UI to ensure immediate rollout.

---

## Student Portal Registration Status Patterns (Sept 2025)

### API Data Consistency Pattern (2025-09-30)
**Problem**: Different API endpoints (`/api/courses` vs `/api/check-student-profile`) returned inconsistent data structures, causing UI inconsistencies where registration status wasn't shown consistently.

**Solution Pattern**: Standardize registration status data across all course-related API endpoints.
```javascript
// Pattern: Consistent course object structure across all endpoints
const courseWithStatus = {
    id: course.id,
    name: course.name,
    // ... other course fields
    registration_status: 'registered_completed' | 'registered_pending' | 'not_registered',
    registration_id: registrationId || null,
    payment_status: paymentStatus || null
};
```

**Implementation**:
- Both `/api/courses` and `/api/check-student-profile` now include identical registration status data
- Status lookup performed server-side via JOIN queries for data consistency
- Prevents client-side data inconsistencies and reduces API calls

### Registration Status Visual State Pattern
**Pattern**: Visual indicators that reflect backend registration state without requiring additional API calls.

```css
.registration-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
}

.registration-status-badge.registered {
    background: rgba(40, 167, 69, 0.1);
    color: #28a745;
    border: 1px solid rgba(40, 167, 69, 0.3);
}
```

**Implementation**:
- Course cards show registration status badges based on server-provided data
- Button states (disabled/enabled) reflect registration status
- Status badges persist across navigation and page refreshes

### Student Session Preservation Pattern (2025-09-30)
**Problem**: "Register Another Class" button didn't preserve student session data, forcing users to re-enter profile information.

**Solution Pattern**: Event handler management with session state preservation.
```javascript
// Pattern: Session-preserving navigation
resetRegistration() {
    // Clear form state
    this.selectedCourse = null;
    this.selectedDropIn = null;
    this.registrationData = {};
    
    // Preserve student session data
    const studentEmail = this.studentData?.email;
    
    // Reload with preserved session
    if (studentEmail) {
        this.checkStudentProfile(); // Maintain student context
    } else {
        this.loadCourses(); // Guest flow
    }
}
```

**Key Benefits**:
- Maintains student context across multiple registrations
- Prevents data re-entry for existing students
- Seamless multi-course registration experience

### Event Handler Lifecycle Management
**Pattern**: Proper event listener attachment and cleanup for dynamic UI elements.

```javascript
setupEventListeners() {
    // Clear any existing listeners before adding new ones
    const registerAnother = document.getElementById('registerAnother');
    if (registerAnother) {
        registerAnother.addEventListener('click', () => {
            this.resetRegistration();
        });
    }
}
```

**Implementation Guidelines**:
- Always check for element existence before attaching listeners
- Use named functions for easier debugging
- Consider cleanup for dynamic elements to prevent memory leaks
- Attach listeners after DOM elements are confirmed to exist

### Progressive Data Enrichment Pattern
**Pattern**: Server-side API responses progressively include more context based on request parameters.

```javascript
// Pattern: Context-aware API responses
if (studentEmail) {
    // Include registration status when student context is available
    const registrationQuery = `
        SELECT r.id as registration_id, r.payment_status 
        FROM registrations r 
        WHERE r.student_id = ? AND r.course_id = ?
    `;
    course.registration_status = registrationData ? 
        (registrationData.payment_status === 'completed' ? 'registered_completed' : 'registered_pending') :
        'not_registered';
}
```

**Benefits**:
- Single API call provides all necessary context
- Reduces frontend complexity and API round-trips
- Enables consistent UI state across different entry points

### Registration Status State Management
**Implementation Pattern**: Server-driven state with client-side rendering based on status flags.

```javascript
// Pattern: Status-driven UI rendering
const isRegistered = registrationStatus === 'registered_completed';
const isPending = registrationStatus === 'registered_pending';

// Render based on status
button.disabled = availableSpots <= 0 || isRegistered;
button.textContent = isRegistered ? 'Already Registered' : 
                    isPending ? 'Payment Pending' : 
                    availableSpots > 0 ? 'Register Now' : 'Course Full';
```

**Key Principles**:
- Server provides authoritative status data
- Client renders UI based on status flags
- Status changes trigger immediate visual updates
- Consistent status representation across all UI components
### Cache Busting and Staleness Prevention
- `public/admin.html` references:
  - `css/admin-styles.css?v=10`
  - `js/admin.js?v=19`
- Pattern: bump version query params when making CSS/JS changes that affect production UI to ensure immediate rollout.

---

## Student Portal Registration Status Patterns (Sept 2025)

### API Data Consistency Pattern (2025-09-30)
**Problem**: Different API endpoints (`/api/courses` vs `/api/check-student-profile`) returned inconsistent data structures, causing UI inconsistencies where registration status wasn't shown consistently.

**Solution Pattern**: Standardize registration status data across all course-related API endpoints.
```javascript
// Pattern: Consistent course object structure across all endpoints
const courseWithStatus = {
    id: course.id,
    name: course.name,
    // ... other course fields
    registration_status: 'registered_completed' | 'registered_pending' | 'not_registered',
    registration_id: registrationId || null,
    payment_status: paymentStatus || null
};
```

**Implementation**:
- Both `/api/courses` and `/api/check-student-profile` now include identical registration status data
- Status lookup performed server-side via JOIN queries for data consistency
- Prevents client-side data inconsistencies and reduces API calls

### Registration Status Visual State Pattern
**Pattern**: Visual indicators that reflect backend registration state without requiring additional API calls.

```css
.registration-status-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
}

.registration-status-badge.registered {
    background: rgba(40, 167, 69, 0.1);
    color: #28a745;
    border: 1px solid rgba(40, 167, 69, 0.3);
}
```

**Implementation**:
- Course cards show registration status badges based on server-provided data
- Button states (disabled/enabled) reflect registration status
- Status badges persist across navigation and page refreshes

### Student Session Preservation Pattern (2025-09-30)
**Problem**: "Register Another Class" button didn't preserve student session data, forcing users to re-enter profile information.

**Solution Pattern**: Event handler management with session state preservation.
```javascript
// Pattern: Session-preserving navigation
resetRegistration() {
    // Clear form state
    this.selectedCourse = null;
    this.selectedDropIn = null;
    this.registrationData = {};
    
    // Preserve student session data
    const studentEmail = this.studentData?.email;
    
    // Reload with preserved session
    if (studentEmail) {
        this.checkStudentProfile(); // Maintain student context
    } else {
        this.loadCourses(); // Guest flow
    }
}
```

**Key Benefits**:
- Maintains student context across multiple registrations
- Prevents data re-entry for existing students
- Seamless multi-course registration experience

### Event Handler Lifecycle Management
**Pattern**: Proper event listener attachment and cleanup for dynamic UI elements.

```javascript
setupEventListeners() {
    // Clear any existing listeners before adding new ones
    const registerAnother = document.getElementById('registerAnother');
    if (registerAnother) {
        registerAnother.addEventListener('click', () => {
            this.resetRegistration();
        });
    }
}
```

**Implementation Guidelines**:
- Always check for element existence before attaching listeners
- Use named functions for easier debugging
- Consider cleanup for dynamic elements to prevent memory leaks
- Attach listeners after DOM elements are confirmed to exist

### Progressive Data Enrichment Pattern
**Pattern**: Server-side API responses progressively include more context based on request parameters.

```javascript
// Pattern: Context-aware API responses
if (studentEmail) {
    // Include registration status when student context is available
    const registrationQuery = `
        SELECT r.id as registration_id, r.payment_status 
        FROM registrations r 
        WHERE r.student_id = ? AND r.course_id = ?
    `;
    course.registration_status = registrationData ? 
        (registrationData.payment_status === 'completed' ? 'registered_completed' : 'registered_pending') :
        'not_registered';
}
```

**Benefits**:
- Single API call provides all necessary context
- Reduces frontend complexity and API round-trips
- Enables consistent UI state across different entry points

### Registration Status State Management
**Implementation Pattern**: Server-driven state with client-side rendering based on status flags.

```javascript
// Pattern: Status-driven UI rendering
const isRegistered = registrationStatus === 'registered_completed';
const isPending = registrationStatus === 'registered_pending';

// Render based on status
button.disabled = availableSpots <= 0 || isRegistered;
button.textContent = isRegistered ? 'Already Registered' : 
                    isPending ? 'Payment Pending' : 
                    availableSpots > 0 ? 'Register Now' : 'Course Full';
```

**Key Principles**:
- Server provides authoritative status data
- Client renders UI based on status flags
- Status changes trigger immediate visual updates
- Consistent status representation across all UI components
