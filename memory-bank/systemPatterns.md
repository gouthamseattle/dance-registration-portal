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
- No sensitive payment data stored locally
- Transaction IDs stored for reference only

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
