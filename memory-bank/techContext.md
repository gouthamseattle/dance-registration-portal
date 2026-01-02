# Technical Context - Dance Registration Portal

## Technology Stack

### Backend Technologies
- **Runtime**: Node.js (v20.11.0+)
- **Framework**: Express.js 4.18.2
- **Database**: 
  - SQLite 3 (development)
  - PostgreSQL (production via Railway)
- **Authentication**: bcryptjs for password hashing
- **Session Management**: express-session
- **Email**: SendGrid (@sendgrid/mail) for transactional emails; legacy nodemailer notes retained for reference

### Frontend Technologies
- **Core**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS with mobile-first responsive design
- **Payment**: Venmo & Zelle (primary via deep links/QR), PayPal SDK (optional)
- **No Framework**: Intentionally framework-free for simplicity

### Development Dependencies
- **Process Manager**: nodemon for development
- **Environment**: dotenv for configuration
- **CORS**: cors middleware for cross-origin requests

## Development Setup

### Prerequisites
```bash
# Required software
Node.js >= 14.0.0
npm (comes with Node.js)
Git (for version control)

# Optional for production deployment
Railway CLI
```

### Local Development
```bash
# Clone and setup
git clone <repository-url>
cd dance-registration-portal
npm install

# Environment setup
cp .env.example .env
# Edit .env with your configuration

# Database initialization
npm run setup

# Start development server
npm run dev  # Uses nodemon for auto-restart
# OR
npm start   # Standard node server
```

### Environment Variables
```bash
# Required
NODE_ENV=development|production
PORT=3000
SESSION_SECRET=your-secret-key

# Database (production only)
DATABASE_URL=postgresql://...

# Email (primary - SendGrid)
SENDGRID_API_KEY=your-sendgrid-api-key
FROM_EMAIL=sender@example.com
FROM_NAME="Your Sender Name"
REPLY_TO=reply@example.com

# Email (legacy SMTP - optional/fallback reference)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# PayPal (configured via admin panel)
# PAYPAL_CLIENT_ID set through system settings
```

## Database Configuration

### Development (SQLite)
```javascript
// Automatic setup - no configuration needed
// Database file: ./database/registrations.db
// Created automatically on first run
```

### Production (PostgreSQL)
```javascript
// Railway provides DATABASE_URL automatically
// Migration runs automatically on deployment
// Handles schema creation and data transfer
```

### Schema Management
- **Migration Script**: `scripts/migrate-to-postgres.js`
- **Auto-Migration**: Runs on production deployment
- **Schema Sync**: Maintains compatibility between SQLite and PostgreSQL

## Deployment Architecture

### Local Hosting
```bash
# Standard local server
npm start
# Access: http://localhost:3000

# Network sharing (same WiFi)
# Access: http://[local-ip]:3000
# Example: http://10.0.0.24:3000
```

### Production Deployment (Railway)
```bash
# Automatic deployment via Git
git push origin main

# Manual deployment
railway up

# Environment management
railway variables
railway logs
```

### Public Access Options
1. **Railway Domain**: Automatic HTTPS domain
2. **Custom Domain**: Configure via Railway dashboard
3. **ngrok** (development): Temporary public URLs

## Dependencies Overview

### Core Dependencies
```json
{
  "bcryptjs": "^2.4.3",
  "body-parser": "^1.20.2",
  "cors": "^2.8.5",
  "csv-writer": "^1.6.0",
  "dotenv": "^16.3.1",
  "express": "^4.18.2",
  "express-session": "^1.17.3",
  "moment": "^2.29.4",
  "multer": "^1.4.5-lts.1",
  "nodemailer": "^6.9.7",
  "pg": "^8.16.3",
  "qrcode": "^1.5.3",
  "sqlite3": "^5.1.6"
}
```

### Database Schema Updates
- **Registrations Table**: Added `payment_method` column
  - SQLite: `TEXT` datatype
  - PostgreSQL: `VARCHAR(10)` datatype
  - Stores "venmo" or "zelle" to track selected payment method
  - Migration handles both database types with proper syntax

### Development Dependencies
```json
{
  "nodemon": "^3.0.1"
}
```

## Technical Constraints

### Performance Requirements
- **Mobile Load Time**: < 3 seconds on 4G
- **Payment Processing**: < 30 seconds
- **Real-time Updates**: < 5 seconds
- **Concurrent Users**: Up to 100 simultaneous registrations

### Browser Compatibility
- **Modern Browsers**: Chrome 80+, Firefox 75+, Safari 13+
- **Mobile**: iOS Safari 13+, Android Chrome 80+
- **PayPal SDK**: Handles cross-browser payment compatibility

### Security Constraints
- **HTTPS**: Required for PayPal integration in production
- **Session Security**: httpOnly cookies, CSRF protection
- **Data Validation**: Server-side validation for all inputs
- **SQL Injection**: Parameterized queries only

## Tool Usage Patterns

### Development Workflow
```bash
# Daily development
npm run dev          # Start with auto-restart
# Make changes, server restarts automatically

# Database management
sqlite3 database/registrations.db  # Direct database access
npm run setup                      # Reset/initialize database

# Production testing
NODE_ENV=production npm start      # Test production mode locally
```

### Deployment Workflow
```bash
# Standard deployment
git add .
git commit -m "Description"
git push origin main
# Railway auto-deploys

# Emergency deployment
railway up           # Direct deployment
railway logs         # Monitor deployment
```

### Debugging Tools
```bash
# Server logs
npm start            # View console output
railway logs         # Production logs

# Database inspection
sqlite3 database/registrations.db ".tables"
sqlite3 database/registrations.db "SELECT * FROM courses;"

# Network testing
curl -X GET http://localhost:3000/api/courses
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Admin debug endpoints (capacity vs access)
curl -X GET http://localhost:3000/api/admin/debug/course-capacity/123
curl -X GET http://localhost:3000/api/admin/debug/course-access/123
```

## Integration Patterns

### PayPal Integration
```javascript
// Client-side PayPal SDK loading
<script src="https://www.paypal.com/sdk/js?client-id=CLIENT_ID&currency=USD"></script>

// Server-side payment confirmation
PUT /api/registrations/:id/payment
{
  "payment_status": "completed",
  "paypal_transaction_id": "TRANSACTION_ID",
  "payment_method": "paypal"
}
```

### Email Integration
```javascript
// Configurable SMTP via system settings
// Supports Gmail, custom SMTP servers
// Automatic confirmation emails
// Bulk email capabilities
```

### WhatsApp Integration
```javascript
// URL generation for WhatsApp sharing
const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
// QR code generation for easy sharing
// Mobile-optimized registration links
```

## Recent Implementation Updates (Sept 2025)

### Server
- schedule_info is now computed on GET /api/courses from slot data:
  - Example: "Fridays 7:00 PM - 8:30 PM at Studio G (9/20/2025 - 11/1/2025)"
  - If only start_date present: "(Starts 9/20/2025)"
- Ensures consistent schedule rendering across all UIs including confirmation.
- Boolean normalization for `is_active` across SQLite (1/0) and PostgreSQL (true/false) during updates.
- Capacity check rewritten in POST /api/register using subqueries to avoid join ambiguities (with numeric coercion)
- Added admin debug endpoints:
  - GET /api/admin/debug/course-capacity/:courseId
  - GET /api/admin/debug/course-access/:courseId

### Frontend
- Course cards and Selected Course Info are built from `course.slots`:
  - Per-slot line: "Day Start - End at Location" (+ difficulty when multiple slots).
  - Dates rendered separately (Start Date or Start–End).
  - Graceful fallback to course-level `start_time`/`end_time` if slot times are missing.
- Selection flow hardening (Sept 2025):
  - Numeric ID matching for courses and drop-ins to avoid string/number mismatch across DB drivers
  - Defensive fetch/JSON parsing with response.ok and status checks
  - Debounced selection clicks (isSelecting / isSelectingDropIn) to prevent race conditions
  - Suppressed error toast after successful navigation (only show if not on 'form' step)
  - Refresh course list on back navigation to avoid stale state
  - Robust Instagram/Name field toggle for crew practice
  - Guard errors in showRegistrationForm UI prep (non-blocking)

### Deployment
- Cache-busting added to `public/index.html` for `registration.js` (e.g., `registration.js?v=45ddfb5`) to avoid stale caches in production.
- Bumped registration.js to v=49 after selection flow fixes to ensure latest code in production.
- Railway auto-deploy on git push remains the primary deployment workflow.

### Payment Flow Note
- Venmo deep link + QR flow is active in student portal (with mobile detection and desktop QR generation).
- PayPal SDK logic remains present for potential future use or fallback but Venmo flow is primary for now.

### Admin (Attendance UI Visibility & Roster Filter)
- Manage Attendance roster loads paid-only registrations:
  - `GET /api/admin/registrations?course_id={id}&payment_status=completed`
- Sessions auto-select after load so the Students panel renders individual radios by default.
- Visibility hardening across light/dark themes:
  - Stronger table gridlines (2px), explicit header backgrounds
  - Subtle column tint for radio columns to make radios pop on white backgrounds
  - Larger custom radios (20px) with thick borders and visible checked inner dot
  - Zebra striping for readability; high-contrast text for names/headers
  - Dark mode overrides for borders and checked dot color (success green)
- Suggested dates derive from course metadata; one-click session creation auto-selects and renders roster.

### Admin Assets Cache Busting (Production)
- public/admin.html references:
  - `css/admin-styles.css?v=10`
  - `js/admin.js?v=19`
- Pattern: bump version query params on CSS/JS changes to force production refresh.

---

## Student Portal Registration Status Implementation (Sept 2025)

### Registration Status API Enhancements (2025-09-30)
**Problem Solved**: Student portal showed inconsistent registration status between different API endpoints.

**Technical Implementation**:
- Enhanced `/api/check-student-profile` endpoint to include registration status data
- Added JOIN queries to fetch registration status for each course when student email is provided
- Standardized course object structure across all endpoints to include:
  ```javascript
  {
    registration_status: 'registered_completed' | 'registered_pending' | 'not_registered',
    registration_id: number | null,
    payment_status: string | null
  }
  ```

### Event Handler Architecture (2025-09-30)
**Problem Solved**: "Register Another Class" button wasn't functional due to missing event handlers.

**Implementation Pattern**:
```javascript
// Added to setupEventListeners() in email-profile-registration.js
const registerAnother = document.getElementById('registerAnother');
if (registerAnother) {
    registerAnother.addEventListener('click', () => {
        this.resetRegistration();
    });
}

// Enhanced resetRegistration() to preserve student session
resetRegistration() {
    // Clear form state
    this.selectedCourse = null;
    this.selectedDropIn = null;
    this.registrationData = {};
    
    // Preserve student session data
    const studentEmail = this.studentData?.email;
    if (studentEmail) {
        this.checkStudentProfile(); // Reload with preserved session
    }
}
```

### API Data Consistency Pattern
- Both `/api/courses` and `/api/check-student-profile` now return identical course data structure
- Server-side JOIN queries ensure consistent registration status data
- Eliminates client-side data inconsistencies and reduces API round-trips
- Status badges render consistently across all UI components

### Registration Status Visual Implementation
```css
/* Added registration status badges using existing styling */
.registration-status-badge.registered {
    background: rgba(40, 167, 69, 0.1);
    color: #28a745;
    border: 1px solid rgba(40, 167, 69, 0.3);
}

.registration-status-badge.pending {
    background: rgba(255, 193, 7, 0.1);
    color: #ffc107;
    border: 1px solid rgba(255, 193, 7, 0.3);
}
```

### Session State Management
- Student session data preserved across multiple registrations
- Email-profile workflow maintains context between course registrations
- Prevents data re-entry for existing students
- Seamless multi-course registration experience

### Commits (Latest)
- `4a7ca78` — Fix Register Another Class button and add registration status badges to email-profile system
- `a55df10` — Add registration status data to check-student-profile API endpoint
- `45ddfb5` — Show slot times on cards and form; add fallback to course-level times; fix duplicate variable declarations
- `75511bb` — Compute schedule_info on server from slots (include start/end times and dates) and cache-bust registration.js
- `0ab7057` — Fix re-selection bug: numeric ID matching, stale data guard, cache-bust registration.js to v=48
- `5e8f249` — Suppress spurious selection error toast; add in-progress guards; robust field toggling; cache-bust to v=49
- `a450d07` — Attendance UI visibility: stronger contrast for student names and radio columns; add gridlines and column tint; increase radio size; cache-bust admin-styles.css to v=7
