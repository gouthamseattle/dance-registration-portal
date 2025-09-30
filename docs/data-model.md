# Dance Registration Portal - Data Model Documentation

## A. Executive Summary

### Purpose and Scope
The Dance Registration Portal uses a PostgreSQL database (production) with SQLite for development. The data model supports a comprehensive dance class management system that handles student registration, payment processing, course scheduling, attendance tracking, and waitlist management.

### Key Business Entities
The system is built around **Students** who register for **Courses** through **Registrations**. Courses are flexibly scheduled using **Course Slots** with configurable **Pricing**. The system tracks **Attendance** through **Class Sessions** and manages **Waitlists** when courses are full. **Admin Users** manage the system through various administrative functions controlled by **System Settings**.

### Core Business Functions
- **Student Management**: Profile creation, contact information, classification (general/crew member)
- **Course Management**: Multi-week series, drop-in classes, crew practices with flexible scheduling
- **Registration & Payment**: Venmo/Zelle payment processing, confirmation emails
- **Attendance Tracking**: Session-by-session attendance with completion statistics
- **Waitlist Management**: Automated notifications when spots become available
- **Access Control**: Role-based access for different student types

## B. Entity-Relationship Diagram

### 📊 **[View Interactive Visual Diagram](data-model-diagram.html)**
*Click the link above to open the fully rendered ER diagram with all table relationships and field details.*

### Core Database Structure

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│      STUDENTS       │    │       COURSES       │    │    REGISTRATIONS    │
│ =================== │    │ =================== │    │ =================== │
│ • id (PK)          │    │ • id (PK)          │    │ • id (PK)          │
│ • email (unique)   │    │ • name             │    │ • student_id (FK)  │
│ • first_name       │    │ • course_type      │    │ • course_id (FK)   │
│ • last_name        │    │ • required_student │    │ • payment_status   │
│ • student_type     │    │   _type            │    │ • payment_amount   │
│ • profile_complete │    │ • is_active        │    │ • payment_method   │
│ • admin_classified │    │ • start_date       │    │ • canceled_at      │
│ • [contact fields] │    │ • end_date         │    │ • canceled_by (FK) │
└─────────┬───────────┘    └─────────┬───────────┘    └─────────┬───────────┘
          │                          │                          │
          │ 1:many                   │ 1:many                  │
          │ ┌────────────────────────┼──────────────────────────┘
          │ │                        │
          │ │                        │ 1:many
          │ │            ┌───────────▼───────────┐
          │ │            │     COURSE_SLOTS      │
          │ │            │ ==================== │
          │ │            │ • id (PK)            │
          │ │            │ • course_id (FK)     │
          │ │            │ • capacity           │
          │ │            │ • difficulty_level   │
          │ │            │ • day_of_week        │
          │ │            │ • practice_date      │
          │ │            │ • start_time         │
          │ │            │ • end_time           │
          │ │            │ • location           │
          │ │            └───────────┬───────────┘
          │ │                        │ 1:many
          │ │            ┌───────────▼───────────┐
          │ │            │   COURSE_PRICING      │
          │ │            │ ==================== │
          │ │            │ • id (PK)            │
          │ │            │ • course_slot_id(FK) │
          │ │            │ • pricing_type       │
          │ │            │ • price              │
          │ │            └──────────────────────┘
          │ │
          │ │ many:many via WAITLIST
          │ └─────────┬──────────────────────────┐
          │           │                          │
          │           │ 1:many                   │ 1:many
┌─────────▼───────────▼─┐            ┌───────────▼───────────┐
│       WAITLIST        │            │    CLASS_SESSIONS     │
│ ==================== │            │ ==================== │
│ • id (PK)            │            │ • id (PK)            │
│ • student_id (FK)    │            │ • course_id (FK)     │
│ • course_id (FK)     │            │ • session_date       │
│ • waitlist_position  │            │ • start_time         │
│ • notification_sent  │            │ • end_time           │
│ • payment_link_token │            │ • location           │
│ • status             │            │ • notes              │
└──────────────────────┘            └───────────┬───────────┘
                                                │ 1:many
                          ┌─────────────────────▼───────────┐
                          │    ATTENDANCE_RECORDS           │
                          │ =============================== │
                          │ • id (PK)                      │
                          │ • session_id (FK)              │
                          │ • student_id (FK) ─────────────┼──┐
                          │ • status (present/absent/late) │  │
                          │ • marked_at                    │  │
                          │ • marked_by (FK to ADMIN)     │  │
                          └────────────────────────────────┘  │
                                                             │
┌─────────────────────┐    ┌─────────────────────┐          │
│    ADMIN_USERS      │    │  SYSTEM_SETTINGS    │          │
│ =================== │    │ =================== │          │
│ • id (PK)          │    │ • setting_key (PK)  │          │
│ • username (unique) │    │ • setting_value     │          │
│ • password_hash    │    │ • description       │          │
│ • email            │    │ • updated_at        │          │
│ • last_login       │    └─────────────────────┘          │
└─────────┬───────────┘                                     │
          │                                                 │
          └─────────────────────────────────────────────────┘
                              marks attendance

KEY: PK=Primary Key, FK=Foreign Key, 1:many=One-to-Many Relationship
```

## C. High-Level Table Overview

### **STUDENTS** (User Management)
- **Purpose**: Core user profiles with contact information and classification
- **Key Fields**: `id` (PK), `email` (unique), `student_type` (general/crew_member)
- **Business Function**: Stores all student information, supports access control and profile completion workflows

### **COURSES** (Course Management)
- **Purpose**: Dance classes, series, and crew practices
- **Key Fields**: `id` (PK), `course_type`, `required_student_type`, `is_active`
- **Business Function**: Defines available classes with access control and scheduling metadata

### **REGISTRATIONS** (Enrollment & Payment)
- **Purpose**: Links students to courses with payment tracking
- **Key Fields**: `id` (PK), `student_id` (FK), `course_id` (FK), `payment_status`
- **Business Function**: Core enrollment records with payment processing and audit trails

### **COURSE_SLOTS** (Flexible Scheduling)
- **Purpose**: Time slots and capacity management for courses
- **Key Fields**: `id` (PK), `course_id` (FK), `capacity`, `practice_date`
- **Business Function**: Enables multiple time slots per course with individual capacity limits

### **COURSE_PRICING** (Pricing Configuration)
- **Purpose**: Flexible pricing per slot (full package vs drop-in rates)
- **Key Fields**: `id` (PK), `course_slot_id` (FK), `pricing_type`, `price`
- **Business Function**: Supports multiple pricing tiers per course slot

### **CLASS_SESSIONS** (Attendance Management)
- **Purpose**: Individual class meetings for attendance tracking
- **Key Fields**: `id` (PK), `course_id` (FK), `session_date`
- **Business Function**: Creates trackable sessions within multi-week courses

### **ATTENDANCE_RECORDS** (Attendance Tracking)
- **Purpose**: Per-session attendance data (present/absent/late)
- **Key Fields**: `id` (PK), `session_id` (FK), `student_id` (FK), `status`
- **Business Function**: Tracks individual student attendance across all sessions

### **WAITLIST** (Capacity Management)
- **Purpose**: Manages waiting lists when courses reach capacity
- **Key Fields**: `id` (PK), `student_id` (FK), `course_id` (FK), `waitlist_position`
- **Business Function**: Automated waitlist notifications and position management

### **ADMIN_USERS** (Authentication)
- **Purpose**: Administrative user accounts for system management
- **Key Fields**: `id` (PK), `username` (unique), `password_hash`
- **Business Function**: Secure admin authentication and audit trails

### **SYSTEM_SETTINGS** (Configuration)
- **Purpose**: Application-wide configuration and feature flags
- **Key Fields**: `setting_key` (PK), `setting_value`
- **Business Function**: Runtime configuration for payments, emails, and system behavior

## E. Data Flow Patterns

### **Student Registration Workflow**
1. **Profile Check**: Student email lookup in `STUDENTS` table
2. **Course Selection**: Available courses filtered by `required_student_type` vs `student_type`
3. **Capacity Check**: Sum of `COURSE_SLOTS.capacity` vs completed `REGISTRATIONS`
4. **Registration Creation**: New record in `REGISTRATIONS` with "pending" status
5. **Payment Processing**: Venmo/Zelle payment with status update to "completed"
6. **Confirmation**: Email notification sent via system settings configuration

### **Payment Processing Flow**
1. **Payment Generation**: Venmo/Zelle links created with registration details
2. **Admin Confirmation**: Manual payment verification updates `payment_status`
3. **Email Notification**: Confirmation email sent if `email_notifications_enabled`
4. **Audit Trail**: Payment method and transaction details stored in `REGISTRATIONS`

### **Attendance Tracking Flow**
1. **Session Creation**: Admin creates `CLASS_SESSIONS` for course dates
2. **Roster Loading**: Paid registrations (`payment_status = completed`) loaded as student list
3. **Attendance Marking**: Individual or bulk status updates in `ATTENDANCE_RECORDS`
4. **Completion Tracking**: Percentage calculation across all sessions for reporting

### **Waitlist Management Flow**
1. **Capacity Check**: Registration attempt when course is full
2. **Waitlist Entry**: Student added to `WAITLIST` with position number
3. **Notification Trigger**: Admin sends notification with secure registration token
4. **Priority Registration**: Token-based registration bypasses normal capacity limits
5. **Position Management**: Automatic position adjustment when students are removed

### **Access Control Pattern**
1. **Student Classification**: `student_type` determines available courses
2. **Course Filtering**: `required_student_type` controls course visibility
3. **Registration Validation**: Server-side access control prevents unauthorized registrations
4. **Admin Override**: Admin users can register any student for any course regardless of restrictions

---

*This data model supports a comprehensive dance studio management system with flexible scheduling, automated waitlist management, detailed attendance tracking, and robust payment processing capabilities.*
